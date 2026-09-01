# Fon Broşürü Pipeline

Ata Portföy'ün 15 fonunun tek sayfalık "Fon Bilgi Kartı" broşürünü üretir. Veri kamu
API'lerinden çekilir, sayfa HTML/CSS ile kurulur, headless Chromium (Playwright) ile A4
PDF'e basılır.

Bu dosya **sistemin bugün nasıl çalıştığını** anlatır. Kararların gerekçesi ve tarihçe ağ
klasöründeki `Proje_Gelistirme/20_HTML_Pipeline_Pilotu.md` dosyasında.

Görsel kılavuz: `kilavuz.html` →
<https://claude.ai/code/artifact/fa66b70d-b63d-4d97-b37a-3627f9956908>
(güncellerken aynı URL'e yeniden yayımlayın, yoksa ikinci bir sayfa oluşur).

---

## Haftalık tur

**Her perşembe öğleden sonra → `Tum_Verileri_Yenile.bat`**

On iki adım sırayla çalışır ve sonunda 15 PDF ağ klasöründeki yayın klasörüne kopyalanır:
`Brosurler\<yayın tarihi>\<KOD>.pdf`.

| # | Ne yapar | Dosya |
|---|---|---|
| 1 | Arşivi büyütür: fiyatlar TEFAS'tan, endeksler Borsa İstanbul / Nasdaq / Yahoo'dan | `fetch_arsiv.js` |
| 2 | Kart bilgilerini KAP'tan tazeler (risk değeri, yönetim ücreti, kurucu, denetçi) | `fetch_kap_fund_info.js` |
| 3 | Portföy dağılımını TEFAS'tan çeker (enstrüman kırılımı → pasta grafikleri) | `fetch_tefas_dagilim.js` |
| 4 | USD/TRY kurunu tazeler (ANZ/UANZ grafiğinin para birimi çevrimi) | `fetch_usdtry.js` |
| 5 | 14 fonun fiyat serisi + bileşik karşılaştırma ölçütü | `extract_fund.js` |
| 6 | Aylık ızgara fonları (AAL, DGH, AYA, AAV, AED, TLZ) | `build_monthly_data.js` |
| 7 | Özel bloklar: AYA temettü grafiği, ANZ/UANZ grafiği, ANZ YTM tablosu (rapor) | `extract_aya_dividend.js`, `extract_anz_uanz_chart.js`, `update_anz_guncel_bilgiler.js` |
| 8 | Net Varlık Tutarı'nı TEFAS'tan yazar — **en son burada**: UANZ'ın rapor tarihi 7. adımdan gelir, önce çalışırsa bir tur geriden bir değer yazar | `fetch_tefas_net_varlik.js` |
| 9 | 15 PDF — her aile tek Chromium oturumunda; bir render çökerse tur durur | `render_b2.js`, `render_a.js` |
| 10 | Yayın klasörüne kopyalama | `export_pdfs.js` |
| 11 | Geçen tura göre ne değişti + veri sağlık kontrolü | `tur_ozeti.js` |
| 12 | Tur çıktısını commit'ler ve GitHub'a gönderir | `GitHub_Kaydet_Yukle.bat /sessiz` |

Önce ne olacağını görmek için: `node fetch_arsiv.js --dene` (hiçbir dosyaya yazmaz).
Sadece bir CSS/metin düzeltmesi yaptıysanız veri çekmeden yeniden çizmek için:
`Tum_Fonlari_Yenile.bat`.

### Dağıtım: son adım elle

Pipeline'ın işi yayın klasörünü hazır etmekle biter. **PDF'leri siteye Mete elle yükler**
(29.08.2026 kararı: "sen export ettiğinde ben siteye upload edeceğim") — yükleme tarafında
otomatikleştirilebilecek bir uç yok. Dolayısıyla haftalık turun teslim noktası
`Brosurler\<yayın tarihi>\` klasöründeki 15 PDF'tir; pipeline'ın bir sunucuya taşınmasına
ya da zamanlanmış göreve bağlanmasına da gerek yok — tur Mete'nin makinesinde elle
başlatılır.

### İki ayrı tarih: yayın günü ve veri günü

| | Ne | Nereden |
|---|---|---|
| **Yayın tarihi** | Broşürün başlığındaki rozet ve yayın klasörünün adı | PDF'i ürettiğimiz gün (`lib/static.js` → `yayinTarihi`) |
| **Veri tarihi** | Serilerin bittiği gün — bilgi kartındaki "Birim Fiyat (28.08.2026)" satırı bunu yazar | Arşivde gerçekten mevcut **en son gün** (`lib/arsiv.js` → `kesimFiltresi`) |

**01.09.2026'ya kadar bu her zaman T-1'di** (bugünün satırı arşivde olsa bile okuma
anında atılırdı) — TEFAS o günün fiyatını bazen erken bazen geç yayınladığı için,
tur ne zaman çalışırsa çalışsın öngörülebilir kalsın diye. Ama bu, arşivde o günün
verisi ZATEN VARSA bile onu görmezden geliyordu: Mete pazartesi (31.08) üretilen bir
broşürde rozet "31 Ağustos" derken fiyatın cumadan (3 gün geriden) göründüğünü fark
etti, halbuki pazartesinin fiyatı o an arşivde hazırdı. Artık kesim yok: veri tarihi
her zaman arşivdeki gerçek son gün. TEFAS bugünü henüz yayınlamadıysa (ya da URA'da
görüldüğü gibi 0 gibi geçersiz bir değerle doldurduysa — `fetch_arsiv.js`/
`fetch_tefas_net_varlik.js` artık `fiyat > 0` şartı arıyor) arşivde o günün satırı
zaten olmaz, sonuç kendiliğinden bir önceki iş gününe düşer — aynı güvenlik,
gereksiz gecikme olmadan.

**Adım sırası bu yüzden önemli** (bkz. yukarıdaki tablo): net varlık (8. adım) en
sonda, çünkü `reportDateFor()` o an diskte yazan `data/<kod>.json`'un `lastDate`'ini
kullanıyor — fiyat/extract adımlarından (1, 5-7) önce çalışırsa net varlık bir tur
geriden yazılır.

Yeniden üretim için: `YAYIN_TARIHI=2026-08-27` (rozet ve klasör adı),
`RAPOR_TARIHI=2026-08-26` (veri kesimi, o gün dahil).

Tarihler gün adıyla basılır ("27 Ağustos 2026, Perşembe"). `export_pdfs.js` **veri** bir
haftadan bayatsa uyarır — genelde 1. adımın atlandığı anlamına gelir.

Not: her ikisi de yerel takvim gününü kullanır; `toISOString()` UTC döndürdüğü için
Türkiye saatiyle gece 00:00-03:00 arasında bir gün geriye kayıyordu.

## Kurulum (yeni makine)

```
git clone https://github.com/metetezel/FonBrosurPipeline
npm ci
npx playwright install chromium
```

**`npm install` değil `npm ci`:** bağımlılıklar `package.json`'da `^` ile yazılı, yani
`npm install` yeni bir Playwright sürümü çekebilir ve Playwright kendi tarayıcı ikilisiyle
eşleşmek zorunda. `npm ci` `package-lock.json`'daki sürümleri birebir kurar — iki makinede
aynı çıktıyı garantiler.

Excel'e ihtiyaç yok. Ağ paylaşımına erişim iki şey için gerekli: ANZ'nin eurobond dosyası
(Farshad) ve AYA'nın temettü dosyası (Ferruh Erim), bir de yayın klasörüne kopyalama.

Üretilen dosyalar (`out/`) ve `node_modules/` git'te tutulmaz; ikisi de tek komutla geri
gelir.

---

## Veri

### Kaynaklar

| Kaynak | Ne veriyor | Nasıl |
|---|---|---|
| TEFAS | Günlük birim fiyat (14 fon), net varlık tutarı, yatırımcı sayısı | `POST /api/funds/fonFiyatBilgiGetir`, `fonBilgiGetir` |
| Borsa İstanbul | KYD ve BIST endeksleri, gerçek "Getiri" (temettü dahil) varyantlarıyla | `graphic.php?veriTuru=endeks-graphic&indexCode=` |
| Nasdaq | NQROBO, NQUSB502010T, NQXAUAGR | `POST indexes.nasdaq.com/Index/HistoryData` |
| Yahoo Finance | USD/TRY, URA proxy ETF'i | chart API |
| KAP | Risk değeri, yönetim ücreti, kurucu, denetçi, PY kuruluşu, ISIN, yönetici tecrübesi | `kap.org.tr/tr/fon-bilgileri/genel/<oid>` |
| TEFAS | Portföy dağılımı (enstrüman kırılımı) | `POST /api/funds/dagilimSiraliGetirT` |
| Ağ dosyaları | ANZ eurobond portföyü (Farshad), AYA temettü olayları (Ferruh Erim) | canlı Excel |

**TEFAS'ın site tarafı F5 bot korumasında** — `tefas.gov.tr` sayfaları curl'e de headless
Chromium'a da "URL rejected" döner. Sadece `/api/funds/*` açık, o da düz `fetch` ile sorunsuz.

### Arşiv dosyaları

| Dosya | İçerik |
|---|---|
| `data/fiyat_arsiv.json` | 14 fonun günlük birim fiyatı |
| `data/bench_arsiv.json` | 17 benchmark serisi |
| `data/aylik_getiri_grid.json` | 6 fonun aylık getirileri (2010'a kadar) — **dondurulmuş**, hiçbir API'de yok |
| `data/benchmark_tanimlari.json` | `formal` (fonun resmi ölçütü) + `grafik` (büyüme grafiğinde çizilen seri) |

`fetch_arsiv.js` arşivi büyütür ve **yalnızca ekler** — var olan bir tarihin değerini asla
değiştirmez. TEFAS sadece son 5 yılı verdiği için, kayan pencerenin geçmişi silmemesi bu
birikimli dosyaya bağlı.

Excel arşivi 28.08.2026'da emekliye ayrıldı (`Proje_Gelistirme/Yedek/` altında duruyor);
`migrate_excel_to_json.js` o tek seferlik göçün kaydıdır, normal akışta çalıştırılmaz.

### Statik içerik

| Dosya | Ne var |
|---|---|
| `data/ortak.json` | Şirket geneli: disclaimer, iletişim, CTA, risk yöneticisi, ortak kart satırları, kişi→unvan haritası (ör. Farshad Mirzazadeh → CFA) |
| `data/<kod>_static.json` | Fona özgü: strateji metinleri, avantajlar, vergi tablosu, portföy dağılımı, kart satırları |

`lib/static.js` ikisini birleştirir. **Kural: fon dosyası kendi değerini yazmışsa o kazanır**
(PKP'nin farklı denetçisi, JET'in "T. İş Bankası A.Ş. / Euroclear" saklaması böyle korunur);
yazmamışsa (`null`) `ortak.json`'dan gelir.

**Elle yazılan alanlar** (kamu kaynağında karşılığı yok): strateji ve pazarlama metinleri,
"Neden Yatırım Yapmalıyım"/avantajlar/sektörler, vergi oranı tablosu, ve şu kart satırları:
Kuruluş Tarihi, Para Birimi, Getiri Hesaplaması, Saklama, Alım/Satım Valörü.

**Portföy dağılımı artık otomatik** (`fetch_tefas_dagilim.js`): pastalar TEFAS'ın enstrüman
kırılımını gösteriyor. %1 altındaki kalemler "Diğer"de toplanıyor, yüzdeler tam sayıya
yuvarlanıp fark en büyük dilime ekleniyor. Pasta taşımayan fonlara (AAL, AYA, DGH, PKP)
eklenmiyor. **API adı tahmin edilemezdi:** TEFAS kısaltma kullanıyor
(`dagilimSiraliGetirT`) ve 17 alanlı sabit bir sorgu gövdesi istiyor; eksik gövdeyle
`NullPointerException` dönüyor.

---

## Render

**Seri verisi hangi dosyadan geliyor:** aylık ızgara fonları (AAL, DGH, AYA, AAV, AED,
TLZ) ve ANZ/UANZ `data/<kod>_monthly.json`'dan, geri kalan her fon doğrudan
`data/<kod>.json`'dan (`render_a.js` → `MONTHLY_KAYNAKLI`). AAS ve YLC bir süre boyunca
kimsenin yenilemediği birer `_monthly.json` okuyordu ve sayfaları 31.07 verisinde çakılı
kalmıştı (YLC'ninki üstelik getiri endeksine geçmeden önceki `XGIDA.IS` serisini
taşıyordu) — 29.08.2026'da düzeltildi, o iki dosya silindi.

| Motor | Fonlar | Özellik |
|---|---|---|
| `render_b2.js` | JET, RTG, PKF, PKP, URA | Strateji/sektör/avantaj kutuları, varlık dağılımı donut'u |
| `render_a.js` | AAL, AAS, AAV, AED, ANZ, AYA, DGH, TLZ, UANZ, YLC | Aylık getiri tablosu, karşılaştırma tablosu, vergi tablosu, temettü tablosu, ülke rozetleri, ikinci grafik |

Ortak bileşenler `lib/blocks.js` (header, bilgi kartı, yönetici kartı, risk göstergesi, CTA,
sayfa CSS'i), grafikler `lib/charts.js` (kütüphanesiz, elle SVG — tamamen deterministik).

**Temel kural: her broşür tek A4 sayfasına sığar.** Yeni blok eklenince taşma kontrol
edilmeli.

**Renk kuralı:** tüm fonlarda fon = teal, karşılaştırma ölçütü = turuncu.

`assets/logo_hires_crop.png` gerçek Ata Portföy logosu. PDF'ten logo çıkarırken
`extract_image()` SMask'ı atlayıp arkada siyah kutu bırakabiliyor; güvenilir yöntem
sayfayı yüksek zoom'da render edip ilgili bölgeyi kırpmak.

---

## Yürürlükteki kurallar

- **Net Varlık Tutarı: hep TEFAS.** Önce broşürün rapor tarihine ait kayıt aranır, yoksa en
  yeni snapshot yazılır ve hangi tarihten geldiği çıktıda belirtilir. TEFAS geçmişe dönük
  fon büyüklüğü vermediği için her çalıştırma `data/tefas_net_varlik_log.json`'a snapshot
  biriktirir. UANZ'ın TEFAS'ta kaydı yok (ANZ'nin pay sınıfı), ANZ'nin değerini alır.
  TEFAS bugünün fiyatını/net varlığını henüz hesaplamadıysa 0 ile dolduruyor (URA'da
  01.09.2026'da görüldü) — `fetch_arsiv.js` ve `fetch_tefas_net_varlik.js` artık böyle
  sıfır değerleri sessizce reddediyor, aksi halde arşive/loga sızıp bir sonraki lookup'ı
  bozardı.
- **Portföy dağılımı: en yenisi.** Net varlıkta olduğu gibi, dağılım için broşürün T-1
  kesimi değil TEFAS'ın **son yayınladığı gün** geçerlidir (Mete, 29.08.2026): dağılım
  günlük oynayan bir bilgi değil, T-1'de veri yayınlanmadı diye pastanın boş kalması daha
  kötü. `fetch_tefas_dagilim.js` bugünden başlayıp veri bulunan güne kadar en fazla 10 gün
  geriye gider ve hangi günü kullandığını yazar. TEFAS "veri yok"u iki şekilde döndürüyor —
  boş liste ya da `errorMessage` — ikisi de aynı sayılır; eskiden ikincisi exception'a
  dönüşüp haftalık turu 3. adımda öldürüyordu.
- **Yayın adımı artık sessiz kalmıyor.** `export_pdfs.js` kopyalamaya başlamadan önce 15
  PDF'in tamamını kontrol eder: biri eksikse ya da en yeni PDF'ten bir saatten fazla
  geride kalmışsa (o fonun render'ı sessizce başarısız olmuş demektir) hiçbir şey
  kopyalamadan hata verir. `Tum_Verileri_Yenile.bat` bu hatayı yakalıyor — eskiden son
  adım başarısız olsa bile ekrana "TAMAMLANDI" yazıyordu. Yayın kökü önce `Z:`'de aranır,
  yoksa `//atafiles/...` UNC yoluna düşer: notebook'ta ağ paylaşımı `Z:` olarak eşlenmemiş
  olabilir, iki yol da aynı klasör.
- **Tur kendi çıktısını kaydeder (12. adım).** Kayıt artık isteğe bağlı bir hijyen değil: `tur_ozeti.js` "geçen tura göre ne değişti"yi git geçmişinden okuduğu için commit'lenmeyen bir tur karşılaştırma penceresini sessizce genişletir (gelecek hafta "geçen tur" diye iki tur öncesini gösterir). Push başarısız olursa tur durmaz, uyarı basar — broşürler zaten üretilmiş ve yayın klasörüne kopyalanmış olur, eksik olan sadece kayıttır.
- **Tur özeti (11. adım).** `tur_ozeti.js` her fonun render
  edilmiş `output_<kod>.html` metnini `data/brosur_metin.json`'a snapshot olarak yazar ve
  git'teki bir önceki turun snapshot'ıyla karşılaştırır — yani "geçen haftaya göre hangi
  satır değişti" sorusunun cevabı, render'ın gerçekten bastığı metinden gelir, ayrı bir
  hesaptan değil. Sapma imkânsız. Aynı adım veri sağlığına da bakar: fiyat ve ölçüt
  serilerinin son günü rapor tarihinden geride mi? Geride kalan ölçüt serisi varsa
  etkilenen fonları isim isim yazar — gece yarısı çalışan turda Nasdaq serileri bir gün
  geride kalabiliyor, bu durumda fon serisi T-1'e kadar giderken ölçüt bir gün eksik
  kalıyor. Çözüm basit: turu öğleden sonra tekrar çalıştır.
- **KAP'tan yazılanlar:** risk değeri, yönetim ücreti, kurucu, denetçi, portföy yöneticisi
  kuruluşu. **Yazılmayanlar:** yönetici *ismi* ve tecrübe yılı — KAP fon bazında listeliyor
  ve kendi içinde tutarsız olabiliyor, bu yüzden fark rapora düşer, otomatik değişmez.
  Teyitli istisnalar `fetch_kap_fund_info.js` içinde (JET'in yöneticisi Farshad Mirzazadeh,
  KAP eksik; Farshad'ın tecrübesi 10 yıl).
- **ANZ/UANZ "Fon'un Güncel Bilgileri" tablosu şu an elle.** Hesap
  (`compute_anz_table.js`) hâlâ Elmas Öztürk'ün rakamlarını tam üretemiyor — 31.08.2026'da
  iki gerçek girdi hatası daha düzeltildi (kupon dönem/yıl karışıklığı, satır 25'in bozuk
  verisi) ve sonuç hedefe epey yaklaştı ama tam örtüşmüyor, muhtemelen kısmen Elmas'ın
  referansının bayat olmasından. `update_anz_guncel_bilgiler.js` varsayılan olarak sadece
  raporlar; yazması için `--yaz` gerekir. Detay aşağıda.
- **Mevduat Eşleniği** piyasa verisi değil, aritmetik: net getiri ÷ (1 − mevduat stopajı
  0,25). Yayımlanmış tabloyla birebir doğrulandı (5,40 ÷ 0,75 = 7,20).

### ANZ/UANZ getiri tablosu — neden elle

`bond_ytm.js` standart YTM çözücüsüdür (bisection) ve tahakkuk etmiş faizi hesaba katar:
YTM, nakit akışlarının bugünkü değerini **kirli** fiyata eşitler. (Bu 28.08.2026'da
düzeltilen gerçek bir hataydı — temiz fiyat kullanılıyordu ve %20 kuponlu bir kâğıt %27,5
getiri veriyordu.)

**31.08.2026 güncellemesi — ikinci gerçek hata bulundu:** Book2.xlsx'in kupon kolonu (5)
zaten **dönem başı** oranı tutuyor (6 ayda bir ödenen bir bononun yıllık %6,5 kuponu için
0,0325 yazıyor), ama `bondCashflows()`/`accruedInterest()` bunu yıllık oran sanıp ayrıca
frekansa bölüyordu. 4 ISIN Cbonds/BondBloX ile bağımsız doğrulandı (Hazine US900123DN78:
kayıtlı 3,25% → gerçek yıllık 6,5%; TAV XS2729164462: 4,25% → 8,5%; Yapı Kredi
XS2445343689: 4,63% → 9,25%; Akbank XS3298828966: 3,98% → 7,95% — hepsinde kayıtlı × 2 =
yayımlanmış kupon). Ayrıca satır 25'in (XS3183303018) issuer'ı boş, kuponu "%20" olarak
kayıtlı — gerçekte Türk Eximbank %6,375 03.10.2030 (aynı kaynaklarla doğrulandı), veri
girişi hatası, floater değil. İkisi de düzeltildi (`bond_ytm.js`, `compute_anz_table.js`'de
`COUPON_OVERRIDES`).

İki düzeltme birlikte (accrued interest + kupon dönemi + satır 25) portföy ortalamasını
**%4,57 → %6,28**'e çıkardı — 28.08'deki tek-başına-accrued-interest halinden çok daha iyi,
ama hâlâ Elmas'ın **%7,39**'undan ~1,1 puan uzak. **Önemli metodolojik not:** bu karşılaştırma
tam adil olmayabilir — Elmas'ın elimizdeki en taze rakamı 09.07.2026 tarihli, oysa
Book2.xlsx'in bugünkü (31.08.2026 çalıştırma anında 27.08.2026) satırlarıyla
karşılaştırıyoruz; 7-8 haftalık piyasa hareketi bu farkın bir kısmını (belki tamamını)
açıklayabilir. Yani kalan fark artık kesin biçimde "bizim matematiğimiz hâlâ yanlış" demek
değil — ayrıca Mete'nin ayrıca öğrendiği bir bilgi de var: **ANZ/UANZ'nin gerçek fon
fiyatlaması Bloomberg Terminal kullanıyor**, yani Book2.xlsx'in fiyat kolonu (13) zaten
Bloomberg'in birebir aynısı olmayabilir (gecikmeli/farklı kaynak) — bu da kalan farka
katkıda bulunan üçüncü bir olası faktör.

**Farshad'a sorulacak (hâlâ geçerli):** Book2'nin fiyat ve kupon kolonları tam olarak ne,
Bloomberg'le ne sıklıkta senkronize?  Netleşince (ya da Elmas'tan **aynı tarihli** taze bir
referans rakamı gelince) `compute_anz_table.js` tam kalibre edilip `--yaz` ile otomatiğe
alınabilir. `compute_anz_ytm.js` bono bazında YTM basar (inceleme aracı, aynı sabit-satır
kısıtı var, düzeltilmedi).

**01.09.2026 — Elmas'tan gerçekten taze bir referans geldi (aynı gün, 16:37 mail/tablo) ve
iki gerçek hata daha bulunup düzeltildi:**

1. **Garanti Bankası tahvili (XS2913414384, 03.01.2035 vade) `intervalMonths=12` (yıllık
   ödeme) olarak kayıtlıydı — listede bu şekilde işaretli TEK kâğıt, geri kalan hepsi 6
   aylık.** Cbonds ile doğrulandı: bu Garanti'nin %8,125 03.01.2035 USD kâğıdı, ve
   Book2.xlsx'in ham kupon hücresi (0,0406) tam olarak %8,125'in yarısı — yani sheet'in
   "kupon kolonu dönem-başı oranı tutuyor" kuralı bu kâğıt için de geçerli, hatalı olan
   frekans alanı. Yıllık sanılınca kupon yılda 1 kez ödeniyormuş gibi hesaplanıp bu
   kâğıdın YTM'i %3,68 çıkıyordu (komşularına göre bariz düşük); 6 aylık düzeltilince
   %7,68'e çıktı. `compute_anz_table.js`'de `INTERVAL_OVERRIDES`.
2. **"VADELİ DÖVİZ MEVDUATI" pozisyonunun kendi getirisi artık modelleniyor.** ~400.000
   USD'lik bu mevduatın (Türkiye Finans Katılım, %4,7 oran) "fiyat" kolonu (13) bononkilerle
   aynı formatta değildi — çözüldü: zaten FX-çevrilmiş + o ana kadar tahakkuk etmiş faiz
   dahil TL değeri (100 USD nominal x (1+tahakkuk) x USD/TRY). Kolon 5 (%4,7) direkt oran,
   vade basit — YTM çözücüsüne gerek yok. Önceden bu pozisyon portföy toplamına (payda)
   giriyor ama getiri ortalamasına (pay) hiç girmiyordu, yani ~%7'lik payı sessizce %0
   getiri varsayıyordu.

İkisi birlikte `fonunOrtalamaGetirisi`'ni **%5,67 → %6,32**'ye, `eurobondlarinOrtalamaGetirisi`'ni
**%6,26 → %6,60**'a çıkardı (31.08.2026 verili Book2.xlsx ile) — Elmas'ın aynı günkü tablosuna
(Eurobondların Ort. Getirisi %7,67, Fonun Ort. Getirisi %7,45, Ort. Vade 2,82 yıl) doğru
yönde, anlamlı bir adım ama hâlâ tam örtüşmüyor (~1-1,5 puan / ~0,5 yıl fark kalıyor).
**Önemli:** bu sefer "referans bayat" savunması geçerli değil — Elmas'ın tablosu bugünkü
Book2.xlsx'in rapor tarihinden (31.08.2026) sadece 1 gün sonrasına ait, haftalarca eski
değil. Yani kalan fark artık muhtemelen gerçekten metodolojik/veri kaynaklı (Bloomberg'in
Book2.xlsx'ten farklı fiyatlaması ihtimali hâlâ geçerli en olası aday) — daha fazla
tek-tek bono doğrulaması (Cbonds ile denendi, XS3272983563 için sonuç bulunamadı, diğer
"issuer boş" satırlar aksi kanıt çıkmadı) `--yaz`'ı tetikleyecek kadar yakınlaştırmadı.
Tablo hâlâ elle: **`data/anz_static.json`/`uanz_static.json`'ın `guncelBilgiler.rows`'u bu
oturumda Elmas'ın 01.09.2026 rakamlarıyla güncellendi** (Ortalama Getiri %7,45, Yönetim
Kom. Sonrası %6,70, Net Getiri %5,52, Mevduat Eşliği %7,37, Ort. Vade 2,82), ANZ/UANZ
yeniden render edildi ve `Brosurler\01.09.2026\` yayın klasörüne kopyalandı (aynı gün
içinde, commit `8375d0b`).

**01.09.2026, karar — otomatik hesabı zorlamak yerine aylık elle güncelleme:** Aynı
haftalık tur içinde tekrar hesaplandığında fark hâlâ ~1-1,2 puan civarında duruyor
(bkz. yukarı tablo). Kök neden (muhtemelen Bloomberg-vs-Book2.xlsx fiyat farkı) kısa
vadede kapatılması zor görünüyor. **Mete'nin kararı: bu tabloyu haftalık turda otomatik
kalibre etmeye ÇALIŞMAYALIM — `update_anz_guncel_bilgiler.js` rapor modunda kalmaya
devam etsin (`--yaz` tetiklenmeyecek), Elmas'tan yaklaşık AYDA BİR gelecek taze rakamla
elle güncellenecek.** Haftalık tur bu satırlara dokunmuyor zaten (rapor modu varsayılan),
yani bu karar mevcut davranışı değiştirmiyor, sadece "ne zaman düzelir" beklentisini
haftalıktan aylığa çekiyor.

**31.08.2026 — satır numaraları güvenilir değilmiş:** Bir günden ertesi güne Book2.xlsx'e
yeni bir bölüm eklendi ("VADELİ DÖVİZ MEVDUATI" — Türkiye Finans Katılım'da ~19,2M USD'lik
yeni bir vadeli mevduat pozisyonu), bu da eurobond satırlarını 15-27'den 19-31'e kaydırıp
sabit aralığı kırdı (`compute_anz_table.js` çöktü). Düzeltme: satır aralığı artık
"J.YABANCI TAHVİL" etiketinden dinamik bulunuyor, portföy toplamı da tek tek kategori
toplayarak değil doğrudan "FON PORTFÖY DEĞERİ" satırından okunuyor (yeni bir kategori
eklenirse sessizce dışarıda kalmasın diye). **Bilinen eksik:** yeni mevduat pozisyonunun
kendi getirisi hâlâ modellenmiyor — payı (~%7) portföy değerine giriyor ama getiri
payına girmiyor, yani `fonunOrtalamaGetirisi`'ni gerçekte olması gerekenden biraz düşük
gösteriyor (bugün %5,68 çıktı, dünkü hesaptan daha uzak). Mevduat satırının "fiyat"
kolonu (`4809,17` gibi) temiz-fiyat-100 formatında değil, anlamı netleşmeden getiriye
katılamaz.

---

## Diğer bat dosyaları

| Dosya | Ne yapar |
|---|---|
| `Tum_Fonlari_Yenile.bat` | Veri çekmeden 15 PDF'i yeniden çizer (CSS/metin düzeltmesi sonrası) |
| `Net_Varlik_Guncelle.bat` | Sadece net varlık tazelemesi (haftalık tur zaten yapıyor) |
| `ANZ_UANZ_Guncelle.bat` | ANZ/UANZ verisi + iki PDF |
| `GitHub_Kaydet_Yukle.bat` | Commit + push. Turun 12. adımı bunu `/sessiz "mesaj"` ile çağırır (beklemez, hata olursa 1 döner); çift tıklayınca elle de çalışır |


Ağ klasöründe (`Fon Broşür [Cursor & Claude]\`) iki çift-tıklanabilir kısayol duruyor:
`Haftalik_Tur_BASLAT.bat` (önce `git pull`, sonra `Tum_Verileri_Yenile.bat`) ve
`GitHub_Kaydet_BASLAT.bat` (`GitHub_Kaydet_Yukle.bat`'i çağırır). İkisi de yalnızca bu
klasördeki asıl dosyaları çağırır, kod kopyası taşımaz.

## Açık işler

- **ANZ getiri tablosu:** Farshad'dan kolon tanımları (yukarı bakın). 01.09.2026 itibarıyla
  fark ~1-1,2 puanda oturdu, kısa vadede kapanması beklenmiyor — tablo artık **ayda ~1**
  Elmas'ın gönderdiği taze rakamla elle güncelleniyor, haftalık turdan bağımsız (yukarı
  bakın, "karar" notu).

## 01.09.2026 — proje klasörü temizliği

Yerel depoda 28.08.2026'nın piksel-doğrulama sürecinden kalma 47 debug PNG, geçmişte
üretilmiş 15 kök `*_Brosur_Modern.pdf` ve artık `compute_anz_table.js` ile aynı işi yapan
ama satır kaymasına karşı düzeltilmemiş `compute_anz_ytm.js` silindi (commit `c765ae6`).
Ağ klasöründeki `Brosurler\29.08.2026\` ve `\31.08.2026\` (bilinen fiyat/net varlık
hatalarını taşıyan eski PDF setleri) de silindi. Aynı gün tam haftalık tur elle
çalıştırılıp veri commit `33fc7d8` ile push'landı — pipeline'ın kendisinde bir değişiklik
yok, sadece rutin bir çalıştırma.

---

Bu pipeline'ın kurgusu ve arkasındaki kararlar: <https://metetezel.com>
