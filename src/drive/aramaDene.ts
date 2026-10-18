import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Book } from '../model/types';
import { closePdf, openPdf } from '../okuma/pdf';
import { getPdf } from '../okuma/pdfOnbellek';
import { driveFetch, FOLDER_MIME, qv } from './drive';
import type { DriveLocation } from './driveLibrary';

// Task 6.3a, development only (loaded from main.ts under import.meta.env.DEV, not in the build):
// search discovery. Only GET requests to Drive (PDF bytes may land in the local PDF cache).
//   window.defterAramaDene(q)          — one fullText / name search, with timing and where the files are
//   window.defterAramaHepsi(elYazisi?) — picks the words itself and runs every trial of the 6.3a report
// The result goes to the console and to a box with "Kopyala" (iPad has no console).

const ne = 'defterArama';

interface Dosya {
  id: string; name: string; mimeType: string; parents?: string[]; trashed?: boolean;
  size?: string; createdTime?: string; modifiedTime?: string; appProperties?: Record<string, string>;
}
const ALANLAR = 'id,name,mimeType,parents,trashed,size,createdTime,modifiedTime,appProperties';

interface Sorgu { dosyalar: Dosya[]; ms: number; istek: number; sonraki: boolean; hata?: string }

// One files.list query, every page (or only the first when tekSayfa)
async function sorgu(q: string, pageSize = 100, tekSayfa = false): Promise<Sorgu> {
  const t0 = performance.now();
  const dosyalar: Dosya[] = [];
  let pageToken = '', istek = 0, sonraki = false;
  do {
    const p = new URLSearchParams({ q, fields: `nextPageToken,files(${ALANLAR})`, pageSize: String(pageSize) });
    if (pageToken) p.set('pageToken', pageToken);
    const res = await driveFetch('files?' + p);
    istek++;
    if (!res.ok) return { dosyalar, ms: performance.now() - t0, istek, sonraki, hata: `${res.status} ${(await res.text()).slice(0, 200)}` };
    const j = await res.json() as { files?: Dosya[]; nextPageToken?: string };
    dosyalar.push(...(j.files ?? []));
    pageToken = j.nextPageToken ?? '';
    if (pageToken) sonraki = true;
  } while (pageToken && !tekSayfa);
  return { dosyalar, ms: performance.now() - t0, istek, sonraki };
}

// ---- the Kitaplık tree ----

interface Agac { yol: Map<string, string>; dosyalar: Dosya[]; klasorler: string[]; ms: number; istek: number }

async function agacOku(rootId: string): Promise<Agac> {
  const t0 = performance.now();
  const yol = new Map<string, string>([[rootId, 'Kitaplık']]);
  const dosyalar: Dosya[] = [], klasorler = [rootId];
  let istek = 0, sira = [rootId];
  while (sira.length) {
    const sonraki: string[] = [];
    await Promise.all(sira.map(async id => {
      const r = await sorgu(`'${qv(id)}' in parents and trashed = false`, 1000);
      istek += r.istek;
      for (const f of r.dosyalar) {
        yol.set(f.id, `${yol.get(id)}/${f.name}`);
        if (f.mimeType === FOLDER_MIME) { sonraki.push(f.id); klasorler.push(f.id); } else dosyalar.push(f);
      }
    }));
    sira = sonraki;
  }
  return { yol, dosyalar, klasorler, ms: performance.now() - t0, istek };
}

// Method (a): walk up the parents with files.get until the Kitaplık root (cached)
const ustBellek = new Map<string, string[]>();
async function kitaplikta(f: Dosya, rootId: string): Promise<{ icinde: boolean; istek: number }> {
  let istek = 0;
  const gorulen = new Set<string>();
  let sira = [...(f.parents ?? [])];
  while (sira.length) {
    const id = sira.pop()!;
    if (id === rootId) return { icinde: true, istek };
    if (gorulen.has(id)) continue;
    gorulen.add(id);
    let ust = ustBellek.get(id);
    if (!ust) {
      const res = await driveFetch(`files/${encodeURIComponent(id)}?fields=parents`);
      istek++;
      ust = res.ok ? ((await res.json()) as { parents?: string[] }).parents ?? [] : [];
      ustBellek.set(id, ust);
    }
    sira.push(...ust);
  }
  return { icinde: false, istek };
}

// ---- text from PDFs (pdf.js getTextContent) ----

interface Metin { dosya: Dosya; yol: string; sayfalar: string[]; ms: number; mb: number }

async function metinCikar(f: Dosya, yol: string, enFazla = Infinity, sondan = false): Promise<Metin> {
  const bytes = await getPdf(f.id, f.modifiedTime!);
  const t0 = performance.now();
  let doc: PDFDocumentProxy | null = null;
  try {
    doc = await openPdf(bytes);
    const n = doc.numPages;
    const nums = Array.from({ length: n }, (_, i) => i + 1);
    const secilen = sondan ? nums.slice(-Math.min(enFazla, n)) : nums.slice(0, Math.min(enFazla, n));
    const sayfalar = new Array<string>(n).fill('');
    for (const s of secilen) {
      const tc = await (await doc.getPage(s)).getTextContent();
      sayfalar[s - 1] = tc.items.map(it => ('str' in it ? it.str : '')).join(' ');
    }
    return { dosya: f, yol, sayfalar, ms: performance.now() - t0, mb: bytes.byteLength / 1e6 };
  } finally {
    if (doc) await closePdf(doc);
  }
}

const KELIME = /[\p{L}ß]+/gu;
const kelimeler = (s: string) => s.match(KELIME) ?? [];

// A rare word (the rarest, then the longest); umlaut/ß first when almanca
function nadirKelime(metin: string, almanca: boolean, haric = new Set<string>()): string | null {
  const say = new Map<string, number>();
  for (const k of kelimeler(metin)) if (k.length >= 7) say.set(k, (say.get(k) ?? 0) + 1);
  const aday = [...say.entries()].filter(([k]) => !haric.has(k.toLowerCase()));
  const sirala = (a: [string, number][]) => a.sort((x, y) => x[1] - y[1] || y[0].length - x[0].length)[0]?.[0] ?? null;
  if (almanca) {
    const um = sirala(aday.filter(([k]) => /[äöüÄÖÜß]/.test(k) && !/[ğşıİ]/.test(k)));
    if (um) return um;
  }
  return sirala(aday);
}

// ---- output ----

let satirlar: string[] = [];
const yaz = (s = '') => { satirlar.push(s); console.log(`${ne}: ${s}`); };
const ms = (n: number) => `${Math.round(n)} ms`;
const yas = (iso?: string) => {
  if (!iso) return '?';
  const dk = (Date.now() - Date.parse(iso)) / 60000;
  return dk < 120 ? `${Math.round(dk)} dk önce` : dk < 2880 ? `${Math.round(dk / 60)} sa önce` : `${Math.round(dk / 1440)} gün önce`;
};

function kutu(elYazisiAra?: (k: string) => Promise<void>): void {
  document.getElementById(ne)?.remove();
  const k = document.createElement('div');
  k.id = ne;
  k.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;max-height:60vh;z-index:99999;display:flex;flex-direction:column;gap:8px;background:#fff;color:#111;border:1px solid #888;border-radius:8px;padding:10px;font:12px/1.4 ui-monospace,monospace';
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;overflow:auto;white-space:pre-wrap;flex:1';
  pre.textContent = satirlar.join('\n');
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
  const dugme = (metin: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = metin;
    b.style.cssText = 'padding:8px 12px;border-radius:6px;border:1px solid #888;background:#f4f4f4;cursor:pointer';
    b.addEventListener('click', fn);
    bar.append(b);
    return b;
  };
  dugme('Kopyala', () => { void navigator.clipboard.writeText(satirlar.join('\n')).then(() => { kopyala.textContent = 'Kopyalandı'; }); });
  const kopyala = bar.lastElementChild as HTMLButtonElement;
  if (elYazisiAra) {
    const input = document.createElement('input');
    input.placeholder = 'Elle yazdığın tek kelime (OCR)';
    input.style.cssText = 'padding:8px;border:1px solid #888;border-radius:6px;font-size:16px';
    bar.append(input);
    dugme('OCR ara', () => { const w = input.value.trim(); if (w) void elYazisiAra(w).then(() => { pre.textContent = satirlar.join('\n'); }); });
  }
  dugme('✕', () => k.remove());
  k.append(pre, bar);
  document.body.append(k);
}

// ---- one search ----

interface AramaOrtami { rootId: string; agac: Agac | null }

function dosyaSatiri(f: Dosya, o: AramaOrtami): string {
  const yer = o.agac?.yol.get(f.id) ?? '(Kitaplık dışı ya da bilinmiyor)';
  const isaret = [
    f.trashed ? 'ÇÖPTE' : '',
    f.name.startsWith('~çeviri') ? '~çeviri' : '',
    f.appProperties?.defterGecici === '1' ? 'defterGecici' : '',
    f.appProperties?.defter === '1' ? 'defter:1' : '',
  ].filter(Boolean).join(',');
  return `    - ${yer}${isaret ? ` [${isaret}]` : ''} · ${f.mimeType.replace('application/', '')} · ${f.size ? `${(+f.size / 1e6).toFixed(1)} MB` : ''} · oluşturma ${yas(f.createdTime)}`;
}

async function ara(etiket: string, q: string, o: AramaOrtami, beklenen?: string): Promise<Sorgu> {
  const r = await sorgu(q);
  const tumu = await sorgu(q.replace(/ and trashed = false$/, ''));   // trash included
  const cop = tumu.dosyalar.filter(f => f.trashed).length;
  const icinde = o.agac ? r.dosyalar.filter(f => o.agac!.yol.has(f.id)).length : '?';
  let yurume = '';
  if (r.dosyalar.length) {
    const t0 = performance.now();
    let istek = 0, ic = 0;
    for (const f of r.dosyalar) { const k = await kitaplikta(f, o.rootId); istek += k.istek; if (k.icinde) ic++; }
    yurume = ` · üst zinciri yürüme: ${ic} içinde, ${istek} istek, ${ms(performance.now() - t0)}`;
  }
  yaz(`  ${etiket}: q=${q}`);
  if (r.hata) { yaz(`    HATA ${r.hata}`); return r; }
  yaz(`    ${r.dosyalar.length} sonuç (Kitaplık içinde ${icinde}) · ${ms(r.ms)} · ${r.istek} istek · çöp dahil ${tumu.dosyalar.length} (çöpte ${cop})${yurume}`);
  if (beklenen) yaz(`    beklenen dosya bulundu mu: ${r.dosyalar.some(f => f.id === beklenen) ? 'EVET' : 'HAYIR'}`);
  for (const f of r.dosyalar.slice(0, 8)) yaz(dosyaSatiri(f, o));
  if (r.dosyalar.length > 8) yaz(`    … ${r.dosyalar.length - 8} tane daha`);
  return r;
}

export function installAramaDene(activeLocation: () => DriveLocation | null, books: () => Map<string, Book> | null): void {
  const w = window as unknown as {
    defterAramaDene: (q: string) => Promise<void>;
    defterAramaHepsi: (elYazisi?: string) => Promise<void>;
  };

  w.defterAramaDene = async q => {
    const loc = activeLocation();
    if (!loc) { console.warn(`${ne}: Drive kitaplığı yüklü değil (giriş yapıp bekle).`); return; }
    satirlar = [];
    const o: AramaOrtami = { rootId: loc.rootId, agac: null };
    try {
      await ara('fullText', `fullText contains '${qv(q)}' and trashed = false`, o);
      await ara('ad', `name contains '${qv(q)}' and trashed = false`, o);
    } catch (e) { yaz(`HATA ${e instanceof Error ? e.message : String(e)}`); }
    kutu();
  };

  w.defterAramaHepsi = async elYazisi => {
    const loc = activeLocation();
    if (!loc) { console.warn(`${ne}: Drive kitaplığı yüklü değil (giriş yapıp bekle).`); return; }
    satirlar = [];
    const o: AramaOrtami = { rootId: loc.rootId, agac: null };
    const ozetMetinleri: Metin[] = [];
    const ocrAra = async (kelime: string) => {
      yaz(`
[6] OCR: elle yazılmış kelime "${kelime}"`);
      const r = await ara('OCR', `fullText contains '${qv(kelime)}' and trashed = false`, o);
      yaz(`    ozet.pdf'lerden sonuçta olan: ${ozetMetinleri.filter(m => r.dosyalar.some(f => f.id === m.dosya.id)).map(m => m.yol).join(', ') || 'yok'}`);
      yaz(`    pdf.js metninde geçiyor mu (OCR'sız): ${ozetMetinleri.filter(m => m.sayfalar.some(s => s.toLowerCase().includes(kelime.toLowerCase()))).map(m => m.yol).join(', ') || 'hayır'}`);
    };
    try {
      yaz(`6.3a arama keşfi · ${new Date().toISOString()} · ${navigator.userAgent}`);
      yaz(`Kapsam: https://www.googleapis.com/auth/drive (auth.ts). Aşağıdaki sorgular bu izinle çalıştı/çalışmadı.`);

      // 0. the tree
      const agac = await agacOku(loc.rootId);
      o.agac = agac;
      const pdfler = agac.dosyalar.filter(f => f.mimeType === 'application/pdf');
      yaz(`\n[0] Kitaplık ağacı: ${agac.klasorler.length} klasör, ${agac.dosyalar.length} dosya (${pdfler.length} PDF) · ${agac.istek} istek · ${ms(agac.ms)}`);

      // 1. German word from Programmiergrundlagen
      const pgKitap = [...(books()?.entries() ?? [])].find(([id, b]) => /programmier/i.test(id) || /programmier/i.test(b.baslik ?? ''))?.[0];
      const pgKok = pgKitap ? loc.bookFolderIds.get(pgKitap) : undefined;
      const pgYol = pgKok ? agac.yol.get(pgKok) : undefined;
      const pgPdfler = pgYol ? pdfler.filter(f => agac.yol.get(f.id)!.startsWith(pgYol + '/')) : [];
      const pgPdf = pgPdfler.find(f => /orijinal\.pdf$/i.test(f.name)) ?? pgPdfler[0];
      yaz(`\n[1] Almanca kelime · kitap: ${pgKitap ?? 'Programmiergrundlagen BULUNAMADI'} · PDF: ${pgPdf ? agac.yol.get(pgPdf.id) : '-'}`);
      let almanca: string | null = null, ikinci: string | null = null;
      let metinler: Metin[] = [];
      if (pgPdf) {
        const m = await metinCikar(pgPdf, agac.yol.get(pgPdf.id)!, 15);
        metinler.push(m);
        const hepsi = m.sayfalar.join('\n');
        almanca = nadirKelime(hepsi, true);
        const sayfa = m.sayfalar.find(s => almanca && s.includes(almanca)) ?? '';
        ikinci = nadirKelime(sayfa, false, new Set([almanca?.toLowerCase() ?? '']));
        yaz(`    seçilen: "${almanca}" · aynı sayfadan ikinci: "${ikinci}" · metin ${hepsi.length} karakter (ilk 15 sayfa)`);
      }
      if (almanca) {
        await ara('tam kelime', `fullText contains '${qv(almanca)}' and trashed = false`, o, pgPdf!.id);
        const bas = almanca.slice(0, Math.max(4, Math.ceil(almanca.length * 0.6)));
        await ara(`kelime başı "${bas}"`, `fullText contains '${qv(bas)}' and trashed = false`, o, pgPdf!.id);
        await ara('BÜYÜK harf', `fullText contains '${qv(almanca.toLocaleUpperCase('de'))}' and trashed = false`, o, pgPdf!.id);
        await ara('küçük harf', `fullText contains '${qv(almanca.toLocaleLowerCase('de'))}' and trashed = false`, o, pgPdf!.id);
        const ascii = almanca.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue');
        if (ascii !== almanca) await ara('umlautsuz (ae/oe/ue/ss)', `fullText contains '${qv(ascii)}' and trashed = false`, o, pgPdf!.id);
        if (ikinci) {
          await ara('iki kelime tek ifade', `fullText contains '${qv(`${almanca} ${ikinci}`)}' and trashed = false`, o, pgPdf!.id);
          await ara('iki kelime tırnaklı', `fullText contains '"${qv(`${almanca} ${ikinci}`)}"' and trashed = false`, o, pgPdf!.id);
          await ara('iki kelime and', `fullText contains '${qv(almanca)}' and fullText contains '${qv(ikinci)}' and trashed = false`, o, pgPdf!.id);
        }
      }

      // 2. the largest PDF: a word from its last page
      const buyuk = [...pdfler].sort((a, b) => +(b.size ?? 0) - +(a.size ?? 0))[0];
      yaz(`\n[2] En büyük PDF: ${buyuk ? `${agac.yol.get(buyuk.id)} · ${(+(buyuk.size ?? 0) / 1e6).toFixed(1)} MB` : '-'}`);
      if (buyuk) {
        const m = await metinCikar(buyuk, agac.yol.get(buyuk.id)!, 1, true);
        const son = m.sayfalar[m.sayfalar.length - 1];
        const kelime = nadirKelime(son, false) ?? kelimeler(son).sort((a, b) => b.length - a.length)[0];
        yaz(`    ${m.sayfalar.length} sayfa · son sayfa ${son.length} karakter · seçilen: "${kelime ?? '-'}"`);
        if (kelime) await ara('son sayfadaki kelime', `fullText contains '${qv(kelime)}' and trashed = false`, o, buyuk.id);
      }

      // 3. file name
      const genel = /^(orijinal|ozet|brifing|sorular|kitap)\b/i;
      const adli = pdfler.find(f => !genel.test(f.name) && f.name.replace(/\.pdf$/i, '').length >= 6);
      yaz(`\n[3] Dosya adı: ${adli ? agac.yol.get(adli.id) : 'uygun ad bulunamadı'}`);
      if (adli) {
        const parca = adli.name.replace(/\.pdf$/i, '').split(/[\s_\-.]+/).filter(p => p.length >= 4)[0] ?? adli.name.slice(0, 6);
        await ara(`name contains "${parca}"`, `name contains '${qv(parca)}' and trashed = false`, o, adli.id);
        await ara(`fullText contains "${parca}"`, `fullText contains '${qv(parca)}' and trashed = false`, o, adli.id);
        const orta = adli.name.slice(2, 8);
        await ara(`name contains ortadan "${orta}"`, `name contains '${qv(orta)}' and trashed = false`, o, adli.id);
      }

      // 4. ozet.pdf: photo pages (0 characters) + Turkish word
      const ozetler = pdfler.filter(f => /^ozet\.pdf$/i.test(f.name) && +(f.size ?? 0) < 30e6)
        .sort((a, b) => (b.modifiedTime ?? '').localeCompare(a.modifiedTime ?? '')).slice(0, 6);
      yaz(`\n[4] ozet.pdf'ler (en yeni ${ozetler.length}): sayfa başına karakter, 0 = fotoğraf/taranmış`);
      for (const f of ozetler) {
        try {
          const m = await metinCikar(f, agac.yol.get(f.id)!);
          ozetMetinleri.push(m);
          const bos = m.sayfalar.map((s, i) => s.trim().length ? 0 : i + 1).filter(Boolean);
          yaz(`    ${m.yol} · ${m.sayfalar.length} sayfa · ${m.mb.toFixed(1)} MB · metin ${ms(m.ms)} · boş sayfalar: ${bos.length ? bos.join(',') : 'yok'} · değişme ${yas(f.modifiedTime)}`);
        } catch (e) { yaz(`    ${agac.yol.get(f.id)}: açılamadı (${e})`); }
      }
      metinler = [...metinler, ...ozetMetinleri];
      const tr = metinler.flatMap(m => kelimeler(m.sayfalar.join(' ')).filter(k => k.length >= 6 && /[ğşıİ]/.test(k) && /[ğüşıöçĞÜŞİÖÇ]/.test(k)).map(k => ({ k, m })))
        .sort((a, b) => b.k.length - a.k.length)[0];
      yaz(`\n[5] Türkçe ğüşıöç kelime: ${tr ? `"${tr.k}" (${tr.m.yol})` : 'metinlerde bulunamadı'}`);
      if (tr) {
        await ara('Türkçe', `fullText contains '${qv(tr.k)}' and trashed = false`, o, tr.m.dosya.id);
        await ara('Türkçe BÜYÜK (tr)', `fullText contains '${qv(tr.k.toLocaleUpperCase('tr'))}' and trashed = false`, o, tr.m.dosya.id);
        const asc = tr.k.replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ç/g, 'c');
        await ara('Türkçe harfsiz (gusioc)', `fullText contains '${qv(asc)}' and trashed = false`, o, tr.m.dosya.id);
      }

      // 6. OCR
      if (elYazisi) await ocrAra(elYazisi);
      else yaz(`\n[6] OCR: elle yazılmış kelimeyle denenmedi (kutuya kelime yazıp "OCR ara" ile denenebilir)`);

      // 7. text extraction time on ~64 pages
      const cok = [...metinler].sort((a, b) => Math.abs(a.sayfalar.length - 64) - Math.abs(b.sayfalar.length - 64))[0];
      if (cok) {
        const m = await metinCikar(cok.dosya, cok.yol);
        const kar = m.sayfalar.reduce((t, s) => t + s.length, 0);
        yaz(`\n[7] getTextContent tüm sayfalar: ${m.yol} · ${m.sayfalar.length} sayfa · ${ms(m.ms)} (sayfa başına ${ms(m.ms / m.sayfalar.length)}) · ${kar} karakter`);
      }

      // 8. indexing delay: each extracted PDF's rarest word → found by fullText?
      yaz(`\n[8] İndeksleme: her PDF'in kendi nadir kelimesiyle bulunuyor mu (oluşturma / son değişme)`);
      const gorulen = new Set<string>();
      for (const m of metinler) {
        if (gorulen.has(m.dosya.id)) continue;
        gorulen.add(m.dosya.id);
        const k = nadirKelime(m.sayfalar.join(' '), false);
        if (!k) { yaz(`    ${m.yol}: metin yok`); continue; }
        const r = await sorgu(`fullText contains '${qv(k)}' and trashed = false`);
        yaz(`    ${r.dosyalar.some(f => f.id === m.dosya.id) ? 'BULUNDU ' : 'YOK     '} ${m.yol} · "${k}" · oluşturma ${yas(m.dosya.createdTime)} · değişme ${yas(m.dosya.modifiedTime)}`);
      }
      const yeniler = [...pdfler].sort((a, b) => (b.createdTime ?? '').localeCompare(a.createdTime ?? '')).slice(0, 5);
      yaz(`    en yeni 5 PDF (adıyla fullText):`);
      for (const f of yeniler) {
        const kok = f.name.replace(/\.pdf$/i, '');
        const r = await sorgu(`fullText contains '${qv(kok)}' and '${qv(f.parents?.[0] ?? '')}' in parents and trashed = false`);
        yaz(`    ${r.dosyalar.some(x => x.id === f.id) ? 'BULUNDU ' : 'YOK     '} ${agac.yol.get(f.id)} · oluşturma ${yas(f.createdTime)}`);
      }

      // 9. paging, limiting, exclusion
      yaz(`\n[9] Sayfalama ve sınırlama`);
      const sik = (() => {
        const say = new Map<string, number>();
        for (const m of metinler) for (const k of kelimeler(m.sayfalar.join(' '))) if (k.length >= 5) say.set(k.toLowerCase(), (say.get(k.toLowerCase()) ?? 0) + 1);
        return [...say.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
      })();
      if (sik) {
        const t = await sorgu(`fullText contains '${qv(sik)}' and trashed = false`, 5, true);
        yaz(`  sık kelime "${sik}", pageSize=5: ${t.dosyalar.length} sonuç · nextPageToken ${t.sonraki ? 'VAR' : 'yok'} · ${ms(t.ms)}`);
        const h = await sorgu(`fullText contains '${qv(sik)}' and trashed = false`, 100);
        yaz(`  aynı sorgu, pageSize=100, tüm sayfalar: ${h.dosyalar.length} sonuç · ${h.istek} istek · ${ms(h.ms)} · Kitaplık içinde ${h.dosyalar.filter(f => agac.yol.has(f.id)).length}`);
        const pdfOnly = await sorgu(`fullText contains '${qv(sik)}' and mimeType = 'application/pdf' and trashed = false`, 100);
        yaz(`  + mimeType = pdf: ${pdfOnly.dosyalar.length} sonuç · ${ms(pdfOnly.ms)}${pdfOnly.hata ? ` · HATA ${pdfOnly.hata}` : ''}`);
        const nap = await sorgu(`fullText contains '${qv(sik)}' and not appProperties has { key='defterGecici' and value='1' } and trashed = false`, 100);
        yaz(`  + not appProperties defterGecici: ${nap.hata ? `HATA ${nap.hata}` : `${nap.dosyalar.length} sonuç · ${ms(nap.ms)}`}`);
        const kitapKlasorleri = [...loc.bookFolderIds.values()];
        const ors = (ids: string[]) => ids.map(id => `'${qv(id)}' in parents`).join(' or ');
        const p1 = await sorgu(`fullText contains '${qv(sik)}' and (${ors(kitapKlasorleri)}) and trashed = false`, 100);
        yaz(`  + (${kitapKlasorleri.length} kitap klasörü in parents): ${p1.hata ? `HATA ${p1.hata}` : `${p1.dosyalar.length} sonuç · ${ms(p1.ms)}`} (sadece doğrudan alt dosyalar)`);
        const p2q = `fullText contains '${qv(sik)}' and (${ors(agac.klasorler)}) and trashed = false`;
        const p2 = await sorgu(p2q, 100);
        yaz(`  + (tüm ${agac.klasorler.length} klasör in parents, q ${p2q.length} karakter): ${p2.hata ? `HATA ${p2.hata}` : `${p2.dosyalar.length} sonuç · ${ms(p2.ms)}`}`);
      }
      const cev = await sorgu(`name contains '~çeviri'`, 100);
      yaz(`  ~çeviri dosyaları (çöp dahil): ${cev.dosyalar.length} · çöpte ${cev.dosyalar.filter(f => f.trashed).length} · çöpte olmayan ${cev.dosyalar.filter(f => !f.trashed).length}`);
      yaz(`\nbitti.`);
    } catch (e) {
      yaz(`HATA ${e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)}`);
    }
    kutu(kelime => ocrAra(kelime).catch(e => yaz(`HATA ${e}`)));
  };
}
