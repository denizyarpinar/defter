import type { Book, RibbonV2 } from '../model/types';
import { EK_ID } from '../defter/ozeteEkle';
import { pdfLib, readDefterStrokes } from '../kalem/pdfNotlari';
import { closePdf, openPdf } from '../okuma/pdf';
import { getPdf } from '../okuma/pdfOnbellek';
import { FOLDER_MIME, ok, qv } from './drive';
import type { DriveLocation } from './driveLibrary';
import { saltOkunurFetch } from './saltOkunur';
import { temizlikSec, type Aday, type Secilen } from './temizlikKurallari';

// Task 6.3-0a, development only (loaded from main.ts under import.meta.env.DEV, not in the build):
//   window.defterTemizlikListesi() — the test files left in Drive, as a list. READS ONLY:
//   every Drive request goes through saltOkunurFetch (GET without a body, anything else throws).
//   The current ozet.pdf comes from getPdf (the local PDF cache, or its own download).
// Nothing is trashed, moved or changed. The result: a box with Kopyala, a Markdown file and
// a picture of the photo pages of Konu-01's ozet.pdf (both downloaded).

const ne = 'defterTemizlik';
const KITAP = 'programmiergrundlagen';
const KONU = 'Unite-01-Logik/Konu-01-Aussagenlogik';
const OZET_YOL = `Kitaplık/kitaplar/${KITAP}/${KONU}/ozet.pdf`;
const CEVIRI_KLASORU = 'Defter-ceviri-deneme';
const MAX_KARE = 120;   // thumbnails in the picture at most

interface Dosya {
  id: string; name: string; mimeType: string; parents?: string[];
  size?: string; createdTime?: string; modifiedTime?: string; appProperties?: Record<string, string>;
}
const ALANLAR = 'id,name,mimeType,parents,size,createdTime,modifiedTime,appProperties';

interface Dugum extends Aday { dosya: Dosya }

// ---- Drive, only GET ----

async function liste(q: string): Promise<Dosya[]> {
  const out: Dosya[] = [];
  let pageToken = '';
  do {
    const p = new URLSearchParams({ q, fields: `nextPageToken,files(${ALANLAR})`, pageSize: '1000' });
    if (pageToken) p.set('pageToken', pageToken);
    const j = await (await ok(await saltOkunurFetch('files?' + p), 'Dosyalar listelenirken')).json() as { files?: Dosya[]; nextPageToken?: string };
    out.push(...(j.files ?? []));
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  return out;
}

// The folder and everything under it (not trashed), with paths
async function agac(kok: Dosya, kokYol: string): Promise<Dugum[]> {
  const out: Dugum[] = [{ yol: kokYol, klasor: true, dosya: kok }];
  let sira = [{ id: kok.id, yol: kokYol }];
  while (sira.length) {
    const sonraki: typeof sira = [];
    await Promise.all(sira.map(async k => {
      for (const f of await liste(`'${qv(k.id)}' in parents and trashed = false`)) {
        const yol = `${k.yol}/${f.name}`;
        const klasor = f.mimeType === FOLDER_MIME;
        out.push({ yol, klasor, appProperties: f.appProperties, dosya: f });
        if (klasor) sonraki.push({ id: f.id, yol });
      }
    }));
    sira = sonraki;
  }
  return out;
}

interface Rev { id: string; modifiedTime?: string; keepForever?: boolean; size?: string }

async function surumler(fileId: string): Promise<{ revs: Rev[]; head: string }> {
  const f = `files/${encodeURIComponent(fileId)}`;
  const revs: Rev[] = [];
  let pageToken = '';
  do {
    const q = new URLSearchParams({ fields: 'nextPageToken,revisions(id,modifiedTime,keepForever,size)' });
    if (pageToken) q.set('pageToken', pageToken);
    const j = await (await ok(await saltOkunurFetch(`${f}/revisions?${q}`), 'Sürümler okunurken')).json() as { revisions?: Rev[]; nextPageToken?: string };
    revs.push(...(j.revisions ?? []));
    pageToken = j.nextPageToken ?? '';
  } while (pageToken);
  const head = ((await (await ok(await saltOkunurFetch(`${f}?fields=headRevisionId`), 'Sürüm okunurken')).json()) as { headRevisionId?: string }).headRevisionId ?? '';
  return { revs, head };
}

async function surumBaytlari(fileId: string, revId: string): Promise<Uint8Array> {
  const res = await ok(await saltOkunurFetch(`files/${encodeURIComponent(fileId)}/revisions/${encodeURIComponent(revId)}?alt=media`), 'Sürüm indirilirken');
  return new Uint8Array(await res.arrayBuffer());
}

// ---- one PDF, read only ----

interface Sayfa { no: number; ekId: string | null; karakter: number | null; cizgi: string[] }

// /DefterEkId and Defter strokes per page (pdf-lib, nothing saved); text length with pdf.js when metin
async function sayfalar(bytes: Uint8Array, metin: boolean): Promise<Sayfa[]> {
  const L = await pdfLib();
  const doc = await L.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const key = L.PDFName.of(EK_ID);
  const strokes = await readDefterStrokes(bytes);
  const out: Sayfa[] = doc.getPages().map((p, i) => {
    const v = doc.context.lookup(p.node.get(key));
    const ekId = v instanceof L.PDFString || v instanceof L.PDFHexString ? v.decodeText() : null;
    return { no: i + 1, ekId, karakter: null, cizgi: (strokes.get(i) ?? []).map(s => s.id) };
  });
  if (metin) {
    const pdf = await openPdf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
    try {
      for (const s of out) {
        const tc = await (await pdf.getPage(s.no)).getTextContent();
        s.karakter = tc.items.map(it => ('str' in it ? it.str : '')).join('').trim().length;
      }
    } finally { await closePdf(pdf); }
  }
  return out;
}

// Thumbnails of the chosen pages on one canvas (7 columns); no ekId → red frame
async function onizleme(bytes: Uint8Array, secilen: Sayfa[]): Promise<Blob | null> {
  if (!secilen.length) return null;
  const W = 180, H = 255, ALT = 20, ARA = 10, SUTUN = 7;
  const satir = Math.ceil(secilen.length / SUTUN);
  const sheet = document.createElement('canvas');
  sheet.width = SUTUN * (W + ARA) + ARA;
  sheet.height = satir * (H + ALT + ARA) + ARA;
  const ctx = sheet.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.font = '12px ui-monospace, monospace';
  const pdf = await openPdf(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  const tmp = document.createElement('canvas');
  try {
    for (const [i, s] of secilen.entries()) {
      const x = ARA + (i % SUTUN) * (W + ARA), y = ARA + Math.floor(i / SUTUN) * (H + ALT + ARA);
      const page = await pdf.getPage(s.no);
      const base = page.getViewport({ scale: 1 });
      const scale = Math.min(W / base.width, H / base.height);
      const vp = page.getViewport({ scale });
      tmp.width = Math.floor(vp.width); tmp.height = Math.floor(vp.height);
      await page.render({ canvas: tmp, viewport: vp }).promise;
      ctx.drawImage(tmp, x + (W - tmp.width) / 2, y + (H - tmp.height) / 2);
      ctx.strokeStyle = s.ekId ? '#999' : '#d00';
      ctx.lineWidth = s.ekId ? 1 : 3;
      ctx.strokeRect(x, y, W, H);
      ctx.fillStyle = s.ekId ? '#111' : '#d00';
      ctx.fillText(`s.${s.no} · ${s.ekId ? s.ekId.slice(0, 8) : 'ekId yok'}${s.cizgi.length ? ` · ${s.cizgi.length} not` : ''}`, x, y + H + 14);
    }
  } finally {
    tmp.width = tmp.height = 0;
    await closePdf(pdf);
  }
  const blob = await new Promise<Blob | null>(r => sheet.toBlob(r, 'image/jpeg', 0.8));
  sheet.width = sheet.height = 0;
  return blob;
}

// ---- output ----

const mb = (b?: string | number) => b == null || b === '' ? '?' : `${(+b / 1e6).toFixed(2)} MB`;
const hucre = (s: string) => s.replace(/\|/g, '\\|');
const araliklar = (n: number[]) => {
  const out: string[] = [];
  for (let i = 0; i < n.length; i++) {
    let j = i;
    while (j + 1 < n.length && n[j + 1] === n[j] + 1) j++;
    out.push(i === j ? `${n[i]}` : `${n[i]}–${n[j]}`);
    i = j;
  }
  return out.join(', ') || 'yok';
};

export function indir(blob: Blob, ad: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = ad;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

export function kutu(md: string, resim: Blob | null): void {
  document.getElementById(ne)?.remove();
  const k = document.createElement('div');
  k.id = ne;
  k.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;max-height:60vh;z-index:99999;display:flex;flex-direction:column;gap:8px;background:#fff;color:#111;border:1px solid #888;border-radius:8px;padding:10px;font:12px/1.4 ui-monospace,monospace';
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;overflow:auto;white-space:pre-wrap;flex:1';
  pre.textContent = md;
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  const dugme = (metin: string, fn: (b: HTMLButtonElement) => void) => {
    const b = document.createElement('button');
    b.textContent = metin;
    b.style.cssText = 'padding:8px 12px;border-radius:6px;border:1px solid #888;background:#f4f4f4;cursor:pointer';
    b.addEventListener('click', () => fn(b));
    bar.append(b);
  };
  dugme('Kopyala', b => { void navigator.clipboard.writeText(md).then(() => { b.textContent = 'Kopyalandı'; }); });
  dugme('Markdown indir', () => indir(new Blob([md], { type: 'text/markdown;charset=utf-8' }), 'temizlik-listesi.md'));
  if (resim) dugme('Önizlemeyi indir', () => indir(resim, 'ozet-foto-sayfalar.jpg'));
  dugme('✕', () => k.remove());
  k.append(pre, bar);
  document.body.append(k);
}

// Ribbons pointing into ozet.pdf of Konu-01 (kitap.json: they stay, but may point past the end)
export function kurdeleler(book: Book | undefined): { ad: string; sayfa: number }[] {
  if (!book) return [];
  const out: { ad: string; sayfa: number }[] = [];
  for (const u of book.uniteler) for (const t of u.konular) {
    if (t.klasor.toLowerCase() !== KONU.toLowerCase()) continue;
    for (const [m, pm] of Object.entries(t.kurdeleler)) if (/^ozet\.pdf$/i.test(pm.dosya)) out.push({ ad: `konu kurdelesi (${m})`, sayfa: pm.sayfa });
  }
  const r = book.kurdele;
  if (r && typeof r === 'object' && 'konu' in r) {
    const v2 = r as RibbonV2;
    if (v2.konu.toLowerCase() === KONU.toLowerCase() && /^ozet\.pdf$/i.test(v2.dosya)) out.push({ ad: 'kitap kurdelesi', sayfa: v2.sayfa });
  }
  return out;
}

// ---- the report ----

export async function rapor(loc: DriveLocation, books: Map<string, Book> | null, adim: (s: string) => void): Promise<{ md: string; resim: Blob | null }> {
  const md: string[] = [];
  const y = (s = '') => md.push(s);
  y(`# Test temizliği – liste (6.3-0a, salt okunur)`);
  y();
  y(`${new Date().toISOString()} · sadece GET; hiçbir dosya değişmedi. Çöpteki dosyalar sayılmadı.`);

  // 1. trees
  adim('Kitaplık ağacı okunuyor…');
  const kok = await (await ok(await saltOkunurFetch(`files/${encodeURIComponent(loc.rootId)}?fields=${ALANLAR}`), 'Kitaplık okunurken')).json() as Dosya;
  const kitaplik = await agac(kok, 'Kitaplık');
  adim(`Kitaplık: ${kitaplik.length} öğe. Drive kökünde ${CEVIRI_KLASORU} aranıyor…`);
  const ceviriKokleri = await liste(`name = '${qv(CEVIRI_KLASORU)}' and 'root' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`);
  const ceviri = (await Promise.all(ceviriKokleri.map(k => agac(k, `(Drive kökü)/${CEVIRI_KLASORU}`)))).flat();
  const secilen: Secilen<Dugum>[] = temizlikSec([...kitaplik, ...ceviri]);

  y();
  y(`## 1. Test dosyaları (${secilen.length})`);
  y();
  y(`Kesin: ${secilen.filter(s => s.guven === 'kesin').length} · emin değilim: ${secilen.filter(s => s.guven === 'emin değilim').length} · ${CEVIRI_KLASORU} klasörü: ${ceviriKokleri.length ? 'var' : 'yok'}`);
  y();
  y('| yol | ad | id | boyut | createdTime | defter | defterIslem | defterGecici | neden | güven |');
  y('|---|---|---|---|---|---|---|---|---|---|');
  for (const s of secilen) {
    const f = s.aday.dosya, a = f.appProperties ?? {};
    const yer = s.aday.yol.slice(0, s.aday.yol.lastIndexOf('/'));
    y(`| ${hucre(yer)} | ${hucre(f.name)}${s.aday.klasor ? ' (klasör)' : ''} | ${f.id} | ${s.aday.klasor ? '' : mb(f.size)} | ${f.createdTime ?? ''} | ${a.defter ?? ''} | ${a.defterIslem ?? ''} | ${a.defterGecici ?? ''} | ${hucre(s.neden)} | ${s.guven} |`);
  }

  // 2. ozet.pdf of Konu-01
  y();
  y(`## 2. ${KONU}/ozet.pdf`);
  const ozet = kitaplik.find(d => d.yol.toLowerCase() === OZET_YOL.toLowerCase())?.dosya;
  if (!ozet) { y(); y(`Bulunamadı: ${OZET_YOL}`); return { md: md.join('\n'), resim: null }; }
  adim('ozet.pdf okunuyor (önbellek ya da indirme)…');
  const simdi = new Uint8Array(await getPdf(ozet.id, ozet.modifiedTime!));
  const sS = await sayfalar(simdi, true);
  const foto = sS.filter(s => s.ekId || s.karakter === 0);
  const ekli = sS.filter(s => s.ekId);
  const ekIdsiz0 = sS.filter(s => !s.ekId && s.karakter === 0);
  y();
  y(`id ${ozet.id} · ${sS.length} sayfa · ${mb(ozet.size)} · modifiedTime ${ozet.modifiedTime}`);
  y(`- DefterEkId'li sayfalar: ${araliklar(ekli.map(s => s.no))} (${ekli.length}); ekleme grubu (DefterEkId) sayısı: ${new Set(ekli.map(s => s.ekId)).size}`);
  y(`- Metni 0 karakter, DefterEkId'siz (fotoğraf olabilir, ayrı işaretli): ${araliklar(ekIdsiz0.map(s => s.no))}`);
  y(`- Defter notu olan sayfalar: ${sS.filter(s => s.cizgi.length).map(s => `${s.no} (${s.cizgi.length})`).join(', ') || 'yok'}`);
  y();
  y('### Fotoğraf sayfaları');
  y();
  y('| sayfa | DefterEkId | metin karakteri | Defter notu | ekleme tarihi |');
  y('|---|---|---|---|---|');
  for (const s of foto) y(`| ${s.no} | ${s.ekId ?? '— (ekId yok)'} | ${s.karakter} | ${s.cizgi.length} | bilinmiyor |`);
  y();
  y('Ekleme tarihi PDF\'te yazmıyor; sadece sürüm listesinden (aşağıda, boyut artışı) tahmin edilebilir.');

  // 3. revisions (metadata only)
  adim('Sürümler okunuyor…');
  const { revs, head } = await surumler(ozet.id);
  y();
  y(`### Sürümler (${revs.length}, sadece metadata)`);
  y();
  y('| # | id | modifiedTime | keepForever | boyut | artış | head |');
  y('|---|---|---|---|---|---|---|');
  revs.forEach((r, i) => {
    const onceki = i ? +(revs[i - 1].size ?? 0) : null;
    const artis = onceki == null || !r.size ? '' : `${(+r.size - onceki) >= 0 ? '+' : ''}${((+r.size - onceki) / 1e6).toFixed(2)} MB`;
    y(`| ${i + 1} | ${r.id} | ${r.modifiedTime ?? ''} | ${r.keepForever ? 'EVET' : ''} | ${mb(r.size)} | ${artis} | ${r.id === head ? 'head' : ''} |`);
  });

  // 4. the kept revision(s): the only ones downloaded
  const kept = revs.filter(r => r.keepForever);
  const keptSayfa = new Map<string, Sayfa[]>();
  for (const r of kept) {
    adim(`keepForever sürümü indiriliyor (${mb(r.size)})…`);
    keptSayfa.set(r.id, await sayfalar(await surumBaytlari(ozet.id, r.id), false));
  }
  y();
  y(`### keepForever sürümü`);
  y();
  if (!kept.length) y('keepForever sürümü yok.');
  for (const r of kept) {
    const k = keptSayfa.get(r.id)!;
    y(`- ${r.id} · ${r.modifiedTime} · ${k.length} sayfa · DefterEkId'li: ${araliklar(k.filter(s => s.ekId).map(s => s.no))} · Defter notu olan sayfalar: ${k.filter(s => s.cizgi.length).map(s => `${s.no} (${s.cizgi.length})`).join(', ') || 'yok'}`);
  }

  // 5. two ways
  const kur = kurdeleler(books?.get(KITAP));
  const kalan = sS.filter(s => !s.ekId);
  const sondaMi = ekli.length > 0 && ekli.every(s => s.no > kalan.length);
  y();
  y('## 3. İki yol (sadece hesap; hiçbir şey yapılmadı)');
  y();
  y(`### (a) DefterEkId'li sayfaları çıkarıp yeni sürüm yazmak`);
  y(`- Kalır: ${kalan.length} sayfa (${araliklar(kalan.map(s => s.no))}); bu sayfalardaki ${kalan.reduce((t, s) => t + s.cizgi.length, 0)} Defter notu korunur.`);
  y(`- Gider: ${ekli.length} sayfa; üzerlerindeki ${ekli.reduce((t, s) => t + s.cizgi.length, 0)} Defter notu da gider.`);
  y(`- Fotoğraf sayfaları ${sondaMi ? 'hepsi sonda: kalan sayfaların numarası değişmez' : 'arada da var: sonraki sayfaların numarası kayar'}.`);
  y(`- ekId'siz 0-karakter sayfalar (${araliklar(ekIdsiz0.map(s => s.no))}) bu yolda kendiliğinden çıkmaz; ayrıca seçilmeli.`);
  for (const k of kur) y(`- ${k.ad}: sayfa ${k.sayfa}${k.sayfa > kalan.length ? ` → ${kalan.length} sayfalık dosyada geçersiz olur` : ' → geçerli kalır'}`);
  y(`- Not: sayfa çıkarmak "sadece sona ekleme" kuralının dışında; ayrı Deniz kararı ister. Yedek (keepForever) ve çakışma kontrolü gerekir.`);
  y();
  y('### (b) keepForever sürümüne dönmek');
  if (!kept.length) y('- keepForever sürümü yok; bu yol mümkün değil.');
  for (const r of kept) {
    const k = keptSayfa.get(r.id)!;
    const keptIds = new Set(k.flatMap(s => s.cizgi));
    const simdiIds = new Set(sS.flatMap(s => s.cizgi));
    const sonraNot = sS.filter(s => s.no <= k.length).map(s => ({ no: s.no, n: s.cizgi.filter(id => !keptIds.has(id)).length })).filter(x => x.n);
    const geriGelen = k.map(s => ({ no: s.no, n: s.cizgi.filter(id => !simdiIds.has(id)).length })).filter(x => x.n);
    const sonrakiSayfalar = sS.filter(s => s.no > k.length);
    y(`- Sürüm ${r.id} (${r.modifiedTime}): ${k.length} sayfa. Bugün ${sS.length} sayfa.`);
    y(`- Gider: ${k.length + 1}–${sS.length}. sayfalar (${sonrakiSayfalar.length} sayfa; içlerinde DefterEkId'siz ${sonrakiSayfalar.filter(s => !s.ekId).length}), üzerlerindeki ${sonrakiSayfalar.reduce((t, s) => t + s.cizgi.length, 0)} Defter notu.`);
    y(`- Gider: ilk ${k.length} sayfaya o sürümden sonra çizilen notlar: ${sonraNot.map(x => `s.${x.no}: ${x.n}`).join(', ') || 'yok'}.`);
    y(`- Geri gelir: o sürümde olup sonra silinen notlar: ${geriGelen.map(x => `s.${x.no}: ${x.n}`).join(', ') || 'yok'}.`);
    y(`- Sonraki sürümler (${revs.length - revs.indexOf(r) - 1}) Drive'da kalır ama 30 gün / 100 sürüm sonra silinebilir (keepForever değilse).`);
    for (const kd of kur) y(`- ${kd.ad}: sayfa ${kd.sayfa}${kd.sayfa > k.length ? ` → ${k.length} sayfalık dosyada geçersiz olur` : ' → geçerli kalır'}`);
  }

  // 6. the picture
  adim(`Önizleme çiziliyor (${Math.min(foto.length, MAX_KARE)} sayfa)…`);
  const resim = await onizleme(simdi, foto.slice(0, MAX_KARE));
  y();
  y('## 4. Önizleme');
  y();
  y(`ozet-foto-sayfalar.jpg: ${Math.min(foto.length, MAX_KARE)} sayfa${foto.length > MAX_KARE ? ` (ilk ${MAX_KARE}; toplam ${foto.length})` : ''}. Kırmızı çerçeve = DefterEkId yok.`);
  return { md: md.join('\n'), resim };
}

export function installTemizlikListesi(activeLocation: () => DriveLocation | null, books: () => Map<string, Book> | null): void {
  (window as unknown as { defterTemizlikListesi: () => Promise<void> }).defterTemizlikListesi = async () => {
    const loc = activeLocation();
    if (!loc) { console.warn(`${ne}: Drive kitaplığı yüklü değil (giriş yapıp bekle).`); return; }
    const adim = (s: string) => console.log(`${ne}: ${s}`);
    try {
      const { md, resim } = await rapor(loc, books(), adim);
      console.log(md);
      kutu(md, resim);
    } catch (e) {
      const m = `HATA ${e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)}`;
      console.error(`${ne}: ${m}`, e);
      kutu(m, null);
    }
  };
}
