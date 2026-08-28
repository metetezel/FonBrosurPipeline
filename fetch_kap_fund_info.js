// Pulls the factual card fields from KAP (Kamuyu Aydınlatma Platformu) so they stop
// being hand-copied out of last month's PDF.
//
// Source: https://www.kap.org.tr/tr/fon-bilgileri/genel/<fundOid>
// The page is a Next.js RSC payload, but every value is server-rendered as plain text
// inside it, so a plain fetch (no JS, no browser) is enough. The payload is an ordered
// stream of `children":"<text>"` tokens: a label is followed by its value, and tables
// come out as header-block-then-row-block.
//
// What KAP gives us (verified against the 31.07.2026 brochures):
//   Risk Değeri, Yönetim Ücreti Oranı, Kurucunun Ünvanı, Bağımsız Denetim Kuruluşu,
//   Portföy Yöneticisi Kuruluşu, ISIN, karşılaştırma ölçütü bileşenleri + oranları,
//   fon portföy yöneticilerinin adı ve sermaye piyasası tecrübesi (yıl).
// What it does NOT give (stays in data/<kod>_static.json as master copy):
//   strateji/pazarlama metinleri, vergi tablosu, disclaimer, saklamacı kuruluş,
//   alım/satım valörü, "Getiri Hesaplaması", CTA metinleri.
//
// Usage:
//   node fetch_kap_fund_info.js          çek + data/kap_fund_info.json'a yaz + karşılaştır
//   node fetch_kap_fund_info.js --yaz    farkları data/<kod>_static.json'a da işle
//   node fetch_kap_fund_info.js --dump AAL   tek fonun ham token akışını bas (hata ayıklama)
const fs = require('fs');
const path = require('path');

const { loadStatic } = require('./lib/static');

const KAP_URL = 'https://www.kap.org.tr/tr/fon-bilgileri/genel/';
const FUND_OIDS = {
  AAL: '33E5FED7E36300EAE0530A4A622B2AEA',
  AAS: '33E5FED7E74300EAE0530A4A622B2AEA',
  AAV: '33E5FED7EE3700EAE0530A4A622B2AEA',
  AED: '33E5FED7E73F00EAE0530A4A622B2AEA',
  ANZ: '33E5FED7F11B00EAE0530A4A622B2AEA',
  AYA: '33E5FED7E73B00EAE0530A4A622B2AEA',
  DGH: '33E5FED7EE5B00EAE0530A4A622B2AEA',
  JET: '4028328d8e21d0ec018ef6b1012a047a',
  PKF: '4028328c86d231ff01872880638f6dc5',
  PKP: '4028328c998ee9d5019aa11d4ca5138c',
  RTG: '4028328d838f7dcd0183efe2b5ac5ed2',
  TLZ: '4028328c6ab78362016b08881b5034df',
  URA: '4028328d930ceaec0193494ce7773906',
  YLC: '4028328c7da7e73c017eb0204cc11f50',
};
const ALIASES = { UANZ: 'ANZ' }; // UANZ has no KAP record of its own (share class of ANZ)
const DATA_DIR = path.join(__dirname, 'data');
const OUT_FILE = path.join(DATA_DIR, 'kap_fund_info.json');
const NOISE = ['$undefined', 'Bilgi', 'Görüntüle', 'İhraç Sıra Numarası'];

async function fetchTokens(oid) {
  const res = await fetch(KAP_URL + oid, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error('KAP HTTP ' + res.status);
  let h = await res.text();
  h = h.replace(/\\u([0-9a-fA-F]{4})/g, (m, c) => String.fromCharCode(parseInt(c, 16)));
  h = h.split('\\"').join('"');
  const toks = [];
  const re = /children"\s*:\s*"([^"]{1,400})"/g;
  let m;
  while ((m = re.exec(h)) !== null) {
    const t = m[1].trim();
    if (t) toks.push(t);
  }
  return toks;
}

// value that follows `label`, skipping template noise
function after(toks, label, skip = NOISE) {
  const i = toks.indexOf(label);
  if (i < 0) return null;
  for (let j = i + 1; j < Math.min(i + 6, toks.length); j++) {
    const t = toks[j];
    if (skip.includes(t)) continue;
    // RSC referans yer tutuculari: $undefined, $88, $L21, $@b - deger degil
    if (t.startsWith('$')) continue;
    if (t.startsWith('Tüm fonların')) continue;
    // KAP'in "bu alan bos" yer tutucusu - deger olarak yazilmamali (PKP'nin denetci
    // alaninda bu yakalanip brosure "Bilgi Mevcut Değil" diye yazilmisti)
    if (t === 'Bilgi Mevcut Değil') return null;
    return t;
  }
  return null;
}

function parseManagers(toks) {
  // "<Ad Soyad>", "<gg/aa/yyyy>", "<son 5 yıl>", "<N Yıl>", "<lisanslar>" tekrarlari
  const out = [];
  for (let i = 0; i < toks.length; i++) {
    // KAP bazi fonlarda "22 Yıl", bazilarinda "17 yıl" yaziyor
    const m = /^(\d{1,2}) [Yy]ıl$/.exec(toks[i]);
    if (!m) continue;
    // ismin 3 token onceden gelmesi beklenir (ad, tarih, isler, tecrube)
    const ad = toks[i - 3];
    const tarih = toks[i - 2];
    if (!ad || !/^\d{2}\/\d{2}\/\d{4}$/.test(tarih || '')) continue;
    if (!/^[A-ZÇĞİÖŞÜ]/.test(ad) || ad.length > 45) continue;
    out.push({ ad, goreveAtanma: tarih, tecrubeYil: Number(m[1]) });
  }
  return out;
}

function parseBenchmark(toks) {
  const start = toks.indexOf('Ölçütün Belirlenmesine İlişk. Yönetim Kurulu Karar Tar. ve Say.');
  if (start < 0) return [];
  const stop = toks.indexOf('Eşik Değer');
  const slice = toks.slice(start + 1, stop > start ? stop : start + 25);
  const out = [];
  for (let i = 0; i < slice.length - 1; i++) {
    const oran = Number(String(slice[i + 1]).replace(',', '.'));
    if (slice[i].length > 8 && Number.isFinite(oran) && oran > 0 && oran <= 100) {
      out.push({ ad: slice[i], oran });
      i += 2; // karar tarihini atla
    }
  }
  return out;
}

function parseFee(toks) {
  // Blok: gunluk/yillik ictuzuk orani + gerçekleşen oranlar. Gunluk oran (or. 0,00274)
  // x 365 = yillik (%1,00) - brosurdeki "Yönetim Komisyonu" bu yillik oran.
  const i = toks.indexOf('Performans Ücreti Oranı (%)');
  if (i < 0) return null;
  const nums = [];
  for (let j = i + 1; j < Math.min(i + 12, toks.length); j++) {
    const v = Number(String(toks[j]).replace(',', '.'));
    if (Number.isFinite(v) && String(toks[j]).trim() !== '') nums.push(v);
  }
  if (!nums.length) return null;
  const gunluk = nums.filter(n => n > 0 && n < 0.1).sort((a, b) => b - a)[0];
  if (gunluk) return Math.round(gunluk * 365 * 100) / 100;
  const yillik = nums.filter(n => n >= 0.1 && n <= 10)[0];
  return yillik !== undefined ? yillik : null;
}

function extract(toks) {
  return {
    fonUnvan: toks.find(t => t.startsWith('ATA PORTFÖY') && t.length > 20) || null,
    riskDegeri: (() => { const v = after(toks, 'Risk Değeri'); return v && /^\d$/.test(v) ? Number(v) : null; })(),
    isin: after(toks, 'ISIN Kodu'),
    kurucu: after(toks, 'Kurucunun Ünvanı'),
    denetci: after(toks, 'Bağımsız Denetim Kuruluşu'),
    portfoyYoneticisiKurulus: after(toks, 'Portföy Yöneticisi Kuruluşun Ticaret Ünvanı'),
    yonetimUcretiYillik: parseFee(toks),
    karsilastirmaOlcutu: parseBenchmark(toks),
    yoneticiler: parseManagers(toks),
  };
}

// Karsilastirma icin: bosluk/buyuk-kucuk harf ve sondaki nokta farkini yok say
// ("Ata Portföy Yönetimi A.Ş" ile "ATA PORTFÖY YÖNETİMİ A.Ş." ayni sirket).
const norm = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim()
  .replace(/[.\s]+$/, '').toLocaleLowerCase('tr-TR');

// KAP unvanlari TAMAMI BUYUK harf yaziyor; brosur kart duzeni baslik-buyuk kullaniyor
function baslikBuyuk(s) {
  if (!s || s !== s.toLocaleUpperCase('tr-TR')) return s; // zaten karisik yazim
  const kucukler = ['ve', 'ile'];
  return s.toLocaleLowerCase('tr-TR').split(' ').map(w => {
    if (kucukler.includes(w)) return w;
    if (/^[a-zçğıöşü]\.[a-zçğıöşü]\.?$/.test(w)) return w.toLocaleUpperCase('tr-TR'); // A.Ş.
    return w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1);
  }).join(' ');
}
const pct = v => '%' + v.toFixed(2).replace('.', ',');

// Kurucu/Denetci/Portfoy Yoneticisi sirket geneli alanlar: 15 fon dosyasinda degil,
// data/ortak.json'da duruyorlar (bkz. lib/static.js). Bir fon kendi degerini yazmissa
// (or. PKP'nin denetcisi) o fonun dosyasina, yazmamissa ortak.json'a yaziyoruz.
const ORTAK_ALANLAR = ['Kurucu', 'Denetçi', 'Portföy Yöneticisi'];

function compare(all, { yaz }) {
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('_static.json')).sort();
  const ortakPath = path.join(DATA_DIR, 'ortak.json');
  const ortak = JSON.parse(fs.readFileSync(ortakPath, 'utf-8'));
  let ortakDegisti = false;
  let fark = 0, yazilan = 0;
  for (const file of files) {
    const p = path.join(DATA_DIR, file);
    const s = JSON.parse(fs.readFileSync(p, 'utf-8'));
    const code = s.fundCode;
    const kap = all[ALIASES[code] || code];
    if (!kap) { console.log(`${code}: KAP kaydı yok, atlandı`); continue; }
    const satirlar = [];
    const merged = loadStatic(code); // ortak.json ile birlesmis, gercekte basilan degerler
    const ownRow = label => (s.info || []).find(x => Array.isArray(x) && x[0] === label);
    const infoRow = label => (merged.info || []).find(x => Array.isArray(x) && x[0] === label);
    // ortak alan icin: fonun kendi degeri varsa fona, yoksa ortak.json'a yaz
    const setInfo = label => v => {
      const own = ownRow(label);
      if (own && own[1] !== null) { own[1] = v; return; }
      if (ORTAK_ALANLAR.includes(label)) { ortak.infoOrtak[label] = v; ortakDegisti = true; return; }
      if (own) own[1] = v;
    };

    const kontrol = [
      ['Risk Değeri', s.riskLevel, kap.riskDegeri, v => { s.riskLevel = v; }],
      ['Yönetim Komisyonu', infoRow('Yönetim Komisyonu')?.[1], kap.yonetimUcretiYillik == null ? null : pct(kap.yonetimUcretiYillik),
        setInfo('Yönetim Komisyonu')],
      ['Kurucu', infoRow('Kurucu')?.[1], baslikBuyuk(kap.kurucu), setInfo('Kurucu')],
      ['Denetçi', infoRow('Denetçi')?.[1], baslikBuyuk(kap.denetci), setInfo('Denetçi')],
      ['Portföy Yöneticisi', infoRow('Portföy Yöneticisi')?.[1], baslikBuyuk(kap.portfoyYoneticisiKurulus),
        setInfo('Portföy Yöneticisi')],
    ];
    for (const [ad, mevcut, kapDeger, uygula] of kontrol) {
      if (kapDeger == null) { satirlar.push([ad, mevcut, '(KAP\'ta yok)', 'atlandi']); continue; }
      const ayni = norm(mevcut) === norm(kapDeger);
      if (ayni) { satirlar.push([ad, mevcut, kapDeger, 'ayni']); continue; }
      fark++;
      if (yaz) { uygula(kapDeger); yazilan++; satirlar.push([ad, mevcut, kapDeger, 'YAZILDI']); }
      else satirlar.push([ad, mevcut, kapDeger, 'FARKLI']);
    }
    // Yoneticiler: KAP her fonun KENDI portfoy yoneticilerini yaziyor, brosurlerde ise
    // hepsinde ayni isim var. Ismi otomatik degistirmiyoruz (bu bir icerik karari) -
    // sadece ayni kisiyse tecrube yilini hizalayip, farkli isimleri rapora dusuyoruz.
    const kapAdlar = kap.yoneticiler.map(y => `${y.ad} (${y.tecrubeYil} yıl)`).join(', ') || '(KAP\'ta yok)';
    const brosurYonetici = (s.managers || []).find(m => m.role === 'Fon Yöneticisi');
    if (brosurYonetici) {
      const kapYon = kap.yoneticiler.find(y => norm(y.ad) === norm(brosurYonetici.name));
      if (kapYon) {
        const kapTec = kapYon.tecrubeYil + ' yıl';
        if (norm(brosurYonetici.experience) !== norm(kapTec)) {
          // Tecrube yili otomatik YAZILMIYOR: KAP'in kendisi fon sayfalari arasinda
          // tutarsiz (ayni kisi AAV sayfasinda 10 yil, URA sayfasinda 9 yil) - otomatik
          // yazmak brosurler arasinda ayni kisiyi farkli gostermeye yol acardi.
          satirlar.push([`Fon Yöneticisi tecrübe (${kapYon.ad}) - bilgi`, brosurYonetici.experience, kapTec, 'KONTROL ET']);
        } else satirlar.push(['Fon Yöneticisi', brosurYonetici.name, kapAdlar, 'ayni']);
      } else {
        satirlar.push(['Fon Yöneticisi (isim otomatik yazılmaz)', brosurYonetici.name, kapAdlar, 'KONTROL ET']);
      }
    }
    const kotu = satirlar.filter(r => r[3] !== 'ayni');
    console.log(`\n${code}  (${kotu.length ? kotu.length + ' fark' : 'hepsi ayni'})`);
    for (const [ad, mevcut, kapDeger, durum] of satirlar) {
      if (durum === 'ayni') continue;
      console.log(`   ${ad}\n      broşür: ${mevcut}\n      KAP   : ${kapDeger}   [${durum}]`);
    }
    if (yaz) fs.writeFileSync(p, JSON.stringify(s, null, 2));
  }
  if (yaz && ortakDegisti) {
    fs.writeFileSync(ortakPath, JSON.stringify(ortak, null, 2));
    console.log(`\nŞirket geneli alanlar data/ortak.json'a yazıldı (15 dosyaya değil).`);
  }
  console.log(`\nToplam ${fark} fark${yaz ? `, ${yazilan} alan yazıldı` : ' (yazmak için --yaz)'}.`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--dump') {
    const toks = await fetchTokens(FUND_OIDS[args[1]] || FUND_OIDS.AAL);
    toks.forEach((t, i) => console.log(String(i).padStart(4), '|', t.slice(0, 120)));
    return;
  }
  const all = {};
  for (const [code, oid] of Object.entries(FUND_OIDS)) {
    try {
      const toks = await fetchTokens(oid);
      all[code] = extract(toks);
      const k = all[code];
      console.log(`${code.padEnd(5)} risk=${k.riskDegeri ?? '-'} ücret=${k.yonetimUcretiYillik ?? '-'} ölçüt=${k.karsilastirmaOlcutu.length} yönetici=${k.yoneticiler.length}`);
    } catch (e) {
      console.warn(`${code}: HATA ${e.message}`);
    }
  }
  fs.writeFileSync(OUT_FILE, JSON.stringify({ cekildi: new Date().toISOString(), fonlar: all }, null, 2));
  console.log(`\nYazıldı: ${OUT_FILE}`);
  compare(all, { yaz: args.includes('--yaz') });
}

main().catch(e => { console.error(e); process.exit(1); });
