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

Dokuz adım sırayla çalışır ve sonunda 15 PDF ağ klasöründeki yayın klasörüne kopyalanır:
`Brosurler\<yayın tarihi>\<KOD>.pdf`.

| # | Ne yapar | Dosya |
|---|---|---|
| 1 | Arşivi büyütür: fiyatlar TEFAS'tan, endeksler Borsa İstanbul / Nasdaq / Yahoo'dan | `fetch_arsiv.js` |
| 2 | Kart bilgilerini KAP'tan tazeler (risk değeri, yönetim ücreti, kurucu, denetçi) | `fetch_kap_fund_info.js` |
| 3 | Net Varlık Tutarı'nı TEFAS'tan yazar | `fetch_tefas_net_varlik.js` |
| 4 | USD/TRY kurunu tazeler (ANZ/UANZ grafiğinin para birimi çevrimi) | `fetch_usdtry.js` |
| 5 | 14 fonun fiyat serisi + bileşik karşılaştırma ölçütü | `extract_fund.js` |
| 6 | Aylık ızgara fonları (AAL, DGH, AYA, AAV, AED, TLZ) | `build_monthly_data.js` |
| 7 | Özel bloklar: AYA temettü grafiği, ANZ/UANZ grafiği, ANZ YTM tablosu (rapor) | `extract_aya_dividend.js`, `extract_anz_uanz_chart.js`, `update_anz_guncel_bilgiler.js` |
| 8 | 15 PDF | `render_b2.js`, `render_a.js` |
| 9 | Yayın klasörüne kopyalama | `export_pdfs.js` |

Önce ne olacağını görmek için: `node fetch_arsiv.js --dene` (hiçbir dosyaya yazmaz).
Sadece bir CSS/metin düzeltmesi yaptıysanız veri çekmeden yeniden çizmek için:
`Tum_Fonlari_Yenile.bat`.

### İki ayrı tarih: yayın günü ve veri günü

| | Ne | Nereden |
|---|---|---|
| **Yayın tarihi** | Broşürün başlığındaki rozet ve yayın klasörünün adı | PDF'i ürettiğimiz gün (`lib/static.js` → `yayinTarihi`) |
| **Veri tarihi** | Serilerin bittiği gün — bilgi kartındaki "Birim Fiyat (28.08.2026)" satırı bunu yazar | Her zaman **T-1** (`lib/arsiv.js` → `kesimTarihi`) |

Veri tarafında bugünün satırları okuma anında dışarıda bırakılır. TEFAS o günün fiyatını
bazen yayınlamış oluyor bazen olmuyor; kesim olmasaydı rakamlar kimi hafta bugünün kimi
hafta dünün olurdu. Kesim **arşivde değil okumada**: bugünün verisi yine kaydedilir,
gelecek hafta T-1 olarak kullanılır.

Yeniden üretim için: `YAYIN_TARIHI=2026-08-27` (rozet ve klasör adı),
`RAPOR_TARIHI=2026-08-26` (veri kesimi, o gün dahil).

Tarihler gün adıyla basılır ("27 Ağustos 2026, Perşembe"). `export_pdfs.js` **veri** bir
haftadan bayatsa uyarır — genelde 1. adımın atlandığı anlamına gelir.

Not: her ikisi de yerel takvim gününü kullanır; `toISOString()` UTC döndürdüğü için
Türkiye saatiyle gece 00:00-03:00 arasında bir gün geriye kayıyordu.

## Kurulum (yeni makine)

```
git clone https://github.com/metetezel/FonBrosurPipeline
npm install
npx playwright install chromium
```

Excel'e ihtiyaç yok. Ağ paylaşımına erişim iki şey için gerekli: ANZ'nin eurobond dosyası
(Farshad) ve AYA'nın temettü dosyası (Ferruh Erim), bir de yayın klasörüne kopyalama.

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

**Elle yazılan alanlar** (kamu kaynağında karşılığı yok, arandı ve bulunamadı): strateji ve
pazarlama metinleri, "Neden Yatırım Yapmalıyım"/avantajlar/sektörler, vergi oranı tablosu,
portföy dağılımı yüzdeleri, ve şu kart satırları: Kuruluş Tarihi, Para Birimi, Getiri
Hesaplaması, Saklama, Alım/Satım Valörü.

---

## Render

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
- **KAP'tan yazılanlar:** risk değeri, yönetim ücreti, kurucu, denetçi, portföy yöneticisi
  kuruluşu. **Yazılmayanlar:** yönetici *ismi* ve tecrübe yılı — KAP fon bazında listeliyor
  ve kendi içinde tutarsız olabiliyor, bu yüzden fark rapora düşer, otomatik değişmez.
  Teyitli istisnalar `fetch_kap_fund_info.js` içinde (JET'in yöneticisi Farshad Mirzazadeh,
  KAP eksik; Farshad'ın tecrübesi 10 yıl).
- **ANZ/UANZ "Fon'un Güncel Bilgileri" tablosu şu an elle.** Hesap
  (`compute_anz_table.js`) Elmas Öztürk'ün rakamlarını üretemiyor ve fark bizim
  matematiğimizde değil girdide — Book2.xlsx'in fiyat/kupon kolonları beklenen anlamda
  görünmüyor. `update_anz_guncel_bilgiler.js` varsayılan olarak sadece raporlar; yazması
  için `--yaz` gerekir. Detay aşağıda.
- **Mevduat Eşleniği** piyasa verisi değil, aritmetik: net getiri ÷ (1 − mevduat stopajı
  0,25). Yayımlanmış tabloyla birebir doğrulandı (5,40 ÷ 0,75 = 7,20).

### ANZ/UANZ getiri tablosu — neden elle

`bond_ytm.js` standart YTM çözücüsüdür (bisection) ve tahakkuk etmiş faizi hesaba katar:
YTM, nakit akışlarının bugünkü değerini **kirli** fiyata eşitler. (Bu 28.08.2026'da
düzeltilen gerçek bir hataydı — temiz fiyat kullanılıyordu ve %20 kuponlu bir kâğıt %27,5
getiri veriyordu.) Düzeltme sonrası portföy ortalaması **%4,57**; Elmas'ın rakamı **%7,39**.

Fark girdiden geliyor: Book2.xlsx'te Hazine'nin 2035 vadeli USD kâğıdı %3,25 kupon + 97,93
fiyatla duruyor, bu ~%3,5 USD getiri demek — piyasa ~%7. Yani fiyat kolonu piyasa fiyatı
olmayabilir (maliyet/itfa edilmiş maliyet) ya da kupon kolonu gerçek kupon değil.
**Farshad'a sorulacak:** Book2'nin fiyat ve kupon kolonları tam olarak ne?

Netleşince `compute_anz_table.js` kalibre edilip `--yaz` ile otomatiğe alınabilir.
`compute_anz_ytm.js` bono bazında YTM basar (inceleme aracı).

---

## Diğer bat dosyaları

| Dosya | Ne yapar |
|---|---|
| `Tum_Fonlari_Yenile.bat` | Veri çekmeden 15 PDF'i yeniden çizer (CSS/metin düzeltmesi sonrası) |
| `Net_Varlik_Guncelle.bat` | Sadece net varlık tazelemesi (haftalık tur zaten yapıyor) |
| `ANZ_UANZ_Guncelle.bat` | ANZ/UANZ verisi + iki PDF |
| `GitHub_Kaydet_Yukle.bat` | Commit + push |

## Açık işler

- **ANZ getiri tablosu:** Farshad'dan kolon tanımları (yukarı bakın).
- **Dağıtım:** PDF'lerin siteye nasıl yükleneceği konuşulmadı.
