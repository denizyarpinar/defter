import { currentToken } from '../drive/auth';
import { driveFetch, ok } from '../drive/drive';
import type { DriveLocation } from '../drive/driveLibrary';
import type { BookPage } from '../okuma/kitapSayfalari';
import { getPdf } from '../okuma/pdfOnbellek';
import type { PageContent } from '../okuma/sayfaIcerik';
import { pageKind } from '../okuma/sayfaIcerik';
import { okuApi } from './claudeMotor';
import { eslestir } from './kayit/eslestir';
import { driveOcrApi, kayitOkuDrive, sayfaYaz, type OcrKaynakDosya } from './kayit/kayitDrive';
import type { OcrSayfa } from './kayit/sema';
import { okunanMetinCiz } from './okunanMetin';
import { ReaderOcrSearch, type SearchPage } from './okuyucuArama';
import { MAX_BAYT, MAX_KENAR, PdfSayfaGorselleri } from './sayfaGorseli';

// Task 6.4c-0 (Codex) → 6.4c-2: the reader's handwriting panel. 6.4c-4: opened by the reader's "El yazısını oku"
// button (shown only when api/oku says acik: okumaIzni.ts), closed with × or when no readable PDF is open.
// 1–5 pages of the open PDF: a page with PDF text is skipped, a page in the record shows "okundu",
// "Tekrar oku" reads it again. Each page is read by Claude (api/oku) and written to <pdf>.ocr.json the moment
// it is read. The page image: the embedded JPEG of a photo page, otherwise pdf.js (sayfaGorseli.ts).

export interface ReaderSnapshot {
  file: string; version: string; content: PageContent;
  pages: { page: BookPage; index: number }[];
  focus: number;          // index of the page in view
  yer: DriveLocation;
  go(index: number): void;
}

const DURUM: Record<string, string> = { metin: 'basılı metin var, okunmaz', okundu: 'okundu', okunacak: 'okunacak' };

// The page drawn with pdf.js as a JPEG (long edge ≤ 2000, ≤ 2.9 MB)
async function cizJpeg(content: PageContent, page: BookPage): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  try {
    const v = await content.viewport(page), scale = Math.min(2, MAX_KENAR / Math.max(v.width, v.height));
    canvas.width = Math.min(MAX_KENAR, Math.ceil(v.width * scale)); canvas.height = Math.min(MAX_KENAR, Math.ceil(v.height * scale));
    await content.drawPdf(page, canvas).promise;
    for (const q of [0.92, 0.8, 0.7]) {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Görüntü hazırlanamadı.')), 'image/jpeg', q));
      if (blob.size <= MAX_BAYT) return new Uint8Array(await blob.arrayBuffer());
    }
    throw new Error('Sayfa görseli 3 MB altına indirilemedi.');
  } finally { canvas.width = canvas.height = 0; }
}

export interface OkumaPaneli { ac(): void; kapat(): void }
let kurulu: OkumaPaneli | null = null;

export function installReaderOcr(snapshot: () => ReaderSnapshot | null): OkumaPaneli {
  if (kurulu) return kurulu;
  const host = document.createElement('div'); host.id = 'reader-ocr-search'; host.hidden = true;
  host.setAttribute('role', 'dialog'); host.setAttribute('aria-label', 'El yazısını oku');
  host.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;max-height:55vh;overflow:auto;z-index:10000;background:white;color:#17202a;padding:12px;border:2px solid #567;border-radius:10px;font:15px/1.5 system-ui';
  host.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><b style="flex:1">El yazısını oku</b>
    <button data-close type="button" aria-label="Kapat" style="min-width:40px;min-height:40px">×</button></div>
    <p>Açık dosyada en fazla 5 sayfa. Sayfa görseli Claude'a (Anthropic) gönderilir; okunan metin dosyanın yanındaki .ocr.json'a kaydedilir.
    Basılı metni olan sayfalar gönderilmez.</p>
    <p data-file></p><label>PDF sayfa numaraları (ör. 1,3,5) <input data-pages inputmode="numeric" style="max-width:150px"></label>
    <button data-prepare>Sayfaları kontrol et</button>
    <p data-count>Okunacak sayfa sayısı henüz hesaplanmadı.</p>
    <div data-list></div>
    <button data-start disabled>Oku</button>
    <button data-cancel>İptal</button>
    <p data-status role="status" aria-live="polite"></p>
    <div data-text></div>
    <label>Aranacak kelime <input data-query type="search"></label><button data-search>Ara</button>
    <div data-results></div>`;
  document.body.append(host);
  const el = <T extends HTMLElement>(key: string) => host.querySelector<T>(`[data-${key}]`)!;
  let search: ReaderOcrSearch | undefined, bound: ReaderSnapshot | null = null;
  let epoch = 0, boundEpoch = -1, invalid = false, working = false;
  let lastFile = '';
  const status = (message: string) => { el('status').textContent = message; };
  const valid = () => {
    const now = snapshot();
    return !invalid && !!currentToken() && epoch === boundEpoch && !!bound && !!now
      && now.file === bound.file && now.version === bound.version && now.content === bound.content
      && now.pages.map(p => `${p.index}:${p.page.pdfSayfa}`).join() === bound.pages.map(p => `${p.index}:${p.page.pdfSayfa}`).join();
  };
  const invalidate = () => {
    if (!search || invalid) return;
    invalid = true; search.forget(); el('results').replaceChildren(); el('list').replaceChildren(); el('text').replaceChildren();
    el<HTMLButtonElement>('start').disabled = true;
    el('count').textContent = 'Eski sayfa seçimi geçersiz.';
    status('Dosya/sürüm veya oturum değişti. Sayfaları tekrar kontrol et.');
  };
  window.addEventListener('defter-auth-change', () => { epoch++; invalidate(); });
  window.addEventListener('pagehide', () => { epoch++; invalidate(); });
  // reader/version changes are noticed even when no button is pressed
  let acik = false;
  const kapat = () => { acik = false; host.hidden = true; };
  el('close').onclick = kapat;
  setInterval(() => {
    const now = snapshot();
    if (!now && !working && acik) kapat();
    el('file').textContent = now ? `Açık dosya: ${now.pages[0]?.page.ad ?? now.file}; PDF sayfaları 1–${now.pages.length}` : 'Okunabilir Drive PDF\'i açık değil.';
    // a new file: the page in view as the default
    if (now && now.file !== lastFile && !working) {
      lastFile = now.file;
      el<HTMLInputElement>('pages').value = String(now.pages.find(p => p.index === now.focus)?.page.pdfSayfa ?? 1);
    }
    if (search && !valid()) invalidate();
  }, 250);
  const verify = async () => { if (!valid()) throw new Error('Dosya/oturum değişti.'); };
  const setButtons = () => {
    for (const key of ['prepare', 'search']) el<HTMLButtonElement>(key).disabled = working;
    el<HTMLButtonElement>('start').disabled = working || !search?.pages.some(p => p.state === 'okunacak') || !valid();
    host.querySelectorAll<HTMLButtonElement>('[data-again]').forEach(b => { b.disabled = working; });
  };
  const action = async (fn: () => Promise<void>) => {
    if (working) return;
    working = true; setButtons();
    try { await fn(); }
    catch (e) { status(e instanceof Error ? e.message : 'İşlem tamamlanmadı.'); }
    finally { working = false; drawList(); setButtons(); }
  };
  const showText = (p: SearchPage) => {
    el('text').replaceChildren();
    if (!p.record) return;
    const h = document.createElement('strong'); h.textContent = `Okunan metin · PDF s.${p.number}`;
    el('text').append(h, okunanMetinCiz(p.record));
  };
  const drawList = () => {
    el('list').replaceChildren(...(search?.pages ?? []).map(p => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:4px 0';
      const t = document.createElement('span'); t.textContent = `s.${p.number} · ${DURUM[p.state ?? 'okunacak']}`;
      row.append(t);
      if (p.state === 'okundu') {
        const show = document.createElement('button'); show.textContent = 'Göster';
        show.onclick = () => showText(p);
        const again = document.createElement('button'); again.textContent = 'Tekrar oku'; again.dataset.again = String(p.number);
        again.onclick = () => void read([p.number]);
        row.append(show, again);
      }
      return row;
    }));
  };
  const read = (again: number[] = []) => action(async () => {
    if (!search || !valid()) throw new Error('Önce sayfaları tekrar kontrol et.');
    status('Okunuyor…'); await search.start(again);
    const last = search.pages.filter(p => p.record).at(-1);
    if (last) showText(again.length ? search.pages.find(p => p.number === again[0]) ?? last : last);
    status('Okundu ve kaydedildi. Model bazı kelimeleri yanlış okuyabilir.');
  });

  el('prepare').onclick = () => void action(async () => {
    const now = snapshot(); if (!now || !currentToken()) throw new Error('Önce Google ile giriş yap ve bir Drive PDF\'i aç.');
    const numbers = el<HTMLInputElement>('pages').value.split(',').map(x => Number(x.trim()));
    if (numbers.some(n => !Number.isInteger(n) || n < 1)) throw new Error('Sayfaları 1,3,5 biçiminde yaz.');
    const selected = numbers.map(number => {
      const found = now.pages.find(p => (p.page.pdfSayfa ?? 1) === number);
      if (!found || pageKind(found.page) !== 'pdf') throw new Error(`s.${number} açık dosyada yok veya PDF sayfası değil.`);
      return { number, index: found.index };
    });
    bound = now; boundEpoch = epoch; invalid = false;
    el('text').replaceChildren(); el('results').replaceChildren();
    status('Dosya ve okuma kaydı hazırlanıyor…');
    const page = (p: SearchPage) => now.pages.find(x => x.index === p.index)!.page;
    // the file once: its bytes (PDF cache), fingerprints, the record, its folder
    const gorseller = await PdfSayfaGorselleri.ac(new Uint8Array(await getPdf(now.file, now.version)));
    await verify();
    const meta = await (await ok(await driveFetch(`files/${encodeURIComponent(now.file)}?fields=name,parents`), 'Dosya bilgisi okunurken')).json() as { name?: string; parents?: string[] };
    if (!meta.parents?.[0]) throw new Error('Dosyanın klasörü bulunamadı. Kitaplığı yenileyip tekrar dene.');
    const kaynak: OcrKaynakDosya = { id: now.file, ad: meta.name ?? page({ number: 1, index: selected[0].index }).ad ?? 'dosya.pdf', klasorId: meta.parents[0] };
    const drive = driveOcrApi(now.yer);
    const kayit = (await kayitOkuDrive(drive, kaynak)).kayit;
    const eslesme = kayit ? eslestir(kayit, gorseller.izler).sayfalar : [];
    await verify();
    search = new ReaderOcrSearch({ valid, verify,
      text: async p => (await now.content.textContent(page(p))).parcalar.map(x => x.str).join(' '),
      recorded: async p => eslesme[p.number - 1] ?? null,
      read: async (p, signal) => {
        const g = await gorseller.gorsel(p.number, () => cizJpeg(now.content, page(p)));
        const o = await okuApi(g.jpeg, { token: currentToken(), signal });
        return { sayfa: p.number, parmakIzi: g.parmakIzi, model: o.model, okunma: new Date().toISOString(), dondurme: 0, satirlar: o.satirlar } satisfies OcrSayfa;
      },
      save: async (_p, reading) => { await sayfaYaz(drive, kaynak, reading); },
      progress: (d, t, p) => status(`Okunuyor ${d}/${t} (s.${p.number})…`)
    });
    const count = await search.prepare(selected);
    el('count').textContent = `Okunacak: ${count} sayfa · okundu: ${search.pages.filter(p => p.state === 'okundu').length} · basılı metinli (atlanır): ${search.pages.filter(p => p.state === 'metin').length}.`;
    const first = search.pages.find(p => p.record);
    if (first) showText(first);
    status(count ? 'Sayıyı kontrol edip Oku düğmesine bas.' : 'Okunacak yeni sayfa yok; okunanları Göster ya da Tekrar oku.');
  });
  el('start').onclick = () => void read();
  el('cancel').onclick = () => { search?.cancel(); status('İptal edildi. Yeni sayfa gönderilmeyecek; okunup kaydedilenler kaldı.'); };
  el('search').onclick = () => void action(async () => {
    el('results').replaceChildren(); if (!search) throw new Error('Önce sayfaları kontrol et.');
    const matches = await search.matches(el<HTMLInputElement>('query').value);
    status(`${matches.length} eşleşen sayfa. Model bazı kelimeleri yanlış/eksik okuyabilir.`);
    for (const match of matches) {
      const button = document.createElement('button'); button.textContent = `PDF s.${match.page.number} · ${match.ocr ? 'okunan metin' : 'basılı metin'}: ${match.excerpt}`;
      button.style.cssText = 'display:block;text-align:left;margin:8px 0;white-space:normal';
      button.onclick = () => void action(async () => { await verify(); bound!.go(match.page.index); kapat(); });
      el('results').append(button);
    }
  });
  kurulu = { ac: () => { acik = true; host.hidden = false; }, kapat };
  return kurulu;
}
