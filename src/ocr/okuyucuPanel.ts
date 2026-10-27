import { currentToken } from '../drive/auth';
import { driveFetch, ok } from '../drive/drive';
import type { DriveLocation } from '../drive/driveLibrary';
import type { BookPage } from '../okuma/kitapSayfalari';
import { getPdf } from '../okuma/pdfOnbellek';
import type { PageContent } from '../okuma/sayfaIcerik';
import { pageKind } from '../okuma/sayfaIcerik';
import { okuApi } from './claudeMotor';
import { eslestir } from './kayit/eslestir';
import { gorunurAlaniDuzelt } from '../ui/gorunurAlan';
import { gosterilen, kelimeDegistir, kelimeGeriAl, kelimeler, tekrarOkuUyarisi, yazildigiGibi, type DuzeltmeHedefi } from './kayit/elleDuzelt';
import { driveOcrApi, duzeltmeYaz, kayitOkuDrive, sayfaYaz, type OcrDrive, type OcrKaynakDosya } from './kayit/kayitDrive';
import { yaziSatiriMi, type OcrKayit, type OcrParca, type OcrSayfa } from './kayit/sema';
import { okunanMetinCiz, type KelimeYeri } from './okunanMetin';
import { aramaMetni, ReaderOcrSearch, type SearchPage } from './okuyucuArama';
import { MAX_BAYT, MAX_KENAR, PdfSayfaGorselleri } from './sayfaGorseli';
import { t, type Anahtar } from '../dil';
import { htmlDoldur } from '../dil/html';

// Task 6.4c-0 (Codex) → 6.4c-2: the reader's handwriting panel. 6.4c-4: opened by the reader's "El yazısını oku"
// button (shown only when api/oku says acik: okumaIzni.ts), closed with × or when no readable PDF is open.
// 1–5 pages of the open PDF: a page with PDF text is skipped, a page in the record shows "okundu",
// "Tekrar oku" reads it again. Each page is read by Claude (api/oku) and written to <pdf>.ocr.json the moment
// it is read. The page image: the embedded JPEG of a photo page, otherwise pdf.js (sayfaGorseli.ts).
// 6.4e-2: after each saved page `okundu(file)` (the reader's clean view looks again, without reopening).
// 6.4e-3: with `duzenlenebilir()` (okumaIzni) a word of the shown text is tapped → a small box in the line
// (Kaydet / Vazgeç / Geri al; Enter / Esc) → duzeltmeYaz on the record → `duzeltildi(file, record)` (the reader's
// memory, the device copy, the clean view). "Tekrar oku" on a page with hand corrections asks first.

export interface ReaderSnapshot {
  file: string; version: string; content: PageContent;
  pages: { page: BookPage; index: number }[];
  focus: number;          // index of the page in view
  yer: DriveLocation;
  go(index: number): void;
}

const DURUM: Record<string, Anahtar> = { metin: 'ocrPanel.durum.metin', okundu: 'ocrPanel.durum.okundu', okunacak: 'ocrPanel.durum.okunacak' };

// The page drawn with pdf.js as a JPEG (long edge ≤ 2000, ≤ 2.9 MB)
async function cizJpeg(content: PageContent, page: BookPage): Promise<Uint8Array> {
  const canvas = document.createElement('canvas');
  try {
    const v = await content.viewport(page), scale = Math.min(2, MAX_KENAR / Math.max(v.width, v.height));
    canvas.width = Math.min(MAX_KENAR, Math.ceil(v.width * scale)); canvas.height = Math.min(MAX_KENAR, Math.ceil(v.height * scale));
    await content.drawPdf(page, canvas).promise;
    for (const q of [0.92, 0.8, 0.7]) {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error(t('ocrPanel.goruntuYok'))), 'image/jpeg', q));
      if (blob.size <= MAX_BAYT) return new Uint8Array(await blob.arrayBuffer());
    }
    throw new Error(t('ocrPanel.ucMb'));
  } finally { canvas.width = canvas.height = 0; }
}

export interface OkumaPaneli { ac(): void; kapat(): void }
let kurulu: OkumaPaneli | null = null;

export interface OkumaPaneliSecenek {
  okundu?(file: string): void;
  duzenlenebilir?(): boolean;                                   // task 6.4e-3: the account may read handwriting
  duzeltildi?(file: string, kayit: OcrKayit): Promise<void>;    // a hand correction written
}

export function installReaderOcr(snapshot: () => ReaderSnapshot | null, o: OkumaPaneliSecenek = {}): OkumaPaneli {
  if (kurulu) return kurulu;
  const host = document.createElement('div'); host.id = 'reader-ocr-search'; host.hidden = true;
  host.setAttribute('role', 'dialog'); host.setAttribute('aria-label', t('ocrPanel.baslik'));
  host.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;max-height:55vh;overflow:auto;z-index:10000;background:white;color:#17202a;padding:12px;border:2px solid #567;border-radius:10px;font:15px/1.5 system-ui';
  host.innerHTML = `<div style="display:flex;align-items:center;gap:8px"><b style="flex:1" data-t="ocrPanel.baslik"></b>
    <button data-close type="button" data-t-aria="genel.kapat" style="min-width:40px;min-height:40px">×</button></div>
    <p data-t="ocrPanel.aciklama"></p>
    <p data-file></p><label><span data-t="ocrPanel.sayfalar"></span> <input data-pages inputmode="numeric" style="max-width:150px"></label>
    <button data-prepare data-t="ocrPanel.kontrol"></button>
    <p data-count data-t="ocrPanel.sayiYok"></p>
    <div data-list></div>
    <button data-start disabled data-t="ocrPanel.oku"></button>
    <button data-cancel data-t="ocrPanel.iptal"></button>
    <p data-status role="status" aria-live="polite"></p>
    <div data-text></div>
    <label><span data-t="ocrPanel.arananKelime"></span> <input data-query type="search"></label><button data-search data-t="genel.ara"></button>
    <div data-results></div>`;
  htmlDoldur(host);
  document.body.append(host);
  const el = <T extends HTMLElement>(key: string) => host.querySelector<T>(`[data-${key}]`)!;
  let search: ReaderOcrSearch | undefined, bound: ReaderSnapshot | null = null;
  let epoch = 0, boundEpoch = -1, invalid = false, working = false;
  let lastFile = '';
  let yazim: { drive: OcrDrive; kaynak: OcrKaynakDosya } | null = null;   // the bound file's record (6.4e-3)
  let duzenKutu: HTMLElement | null = null;
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
    duzenKapat(); yazim = null;
    el('count').textContent = t('ocrPanel.eskiSecim');
    status(t('ocrPanel.degisti'));
  };
  window.addEventListener('defter-auth-change', () => { epoch++; invalidate(); });
  window.addEventListener('pagehide', () => { epoch++; invalidate(); });
  // reader/version changes are noticed even when no button is pressed
  let acik = false;
  const kapat = () => { duzenKapat(); acik = false; host.hidden = true; };
  el('close').onclick = kapat;
  setInterval(() => {
    const now = snapshot();
    if (!now && !working && acik) kapat();
    el('file').textContent = now ? t('ocrPanel.acikDosya', { ad: now.pages[0]?.page.ad ?? now.file, n: now.pages.length }) : t('ocrPanel.pdfYok');
    // a new file: the page in view as the default
    if (now && now.file !== lastFile && !working) {
      lastFile = now.file;
      el<HTMLInputElement>('pages').value = String(now.pages.find(p => p.index === now.focus)?.page.pdfSayfa ?? 1);
    }
    if (search && !valid()) invalidate();
  }, 250);
  const verify = async () => { if (!valid()) throw new Error(t('ocrPanel.oturumDegisti')); };
  const setButtons = () => {
    for (const key of ['prepare', 'search']) el<HTMLButtonElement>(key).disabled = working;
    el<HTMLButtonElement>('start').disabled = working || !search?.pages.some(p => p.state === 'okunacak') || !valid();
    host.querySelectorAll<HTMLButtonElement>('[data-again]').forEach(b => { b.disabled = working; });
  };
  const action = async (fn: () => Promise<void>) => {
    if (working) return;
    working = true; setButtons();
    try { await fn(); }
    catch (e) { status(e instanceof Error ? e.message : t('ocrPanel.tamamlanmadi')); }
    finally { working = false; drawList(); setButtons(); }
  };
  const showText = (p: SearchPage) => {
    duzenKapat();
    el('text').replaceChildren();
    if (!p.record) return;
    const h = document.createElement('strong'); h.textContent = t('ocrPanel.okunanMetin', { no: p.number });
    const duzenle = o.duzenlenebilir?.() && yazim ? { duzenle: (yer: KelimeYeri, w: HTMLElement) => duzenAc(p, yer, w) } : {};
    el('text').append(h, okunanMetinCiz(p.record, duzenle));
    if ('duzenle' in duzenle) {
      const ipucu = document.createElement('small');
      ipucu.style.cssText = 'display:block;color:#555';
      ipucu.textContent = t('ocrPanel.duzeltIpucu');
      el('text').append(ipucu);
    }
  };

  // ---- task 6.4e-3: a word corrected by hand ----
  // Touch screens: the panel sits at the top while the box is open (the keyboard covers the bottom; 5.10g)
  const dokunmatik = () => matchMedia('(pointer: coarse)').matches;
  function duzenKapat(): void {
    if (!duzenKutu) return;
    duzenKutu.remove(); duzenKutu = null;
    host.style.top = ''; host.style.bottom = '12px';
    gorunurAlaniDuzelt('el yazısı düzeltme');   // dil-kontrol: yoksay
  }
  const parcaAl = (s: OcrSayfa, yer: KelimeYeri): OcrParca | null => {
    const satir = s.satirlar[yer.satir];
    return satir && yaziSatiriMi(satir) ? satir.parcalar[yer.parca] ?? null : null;
  };
  const duzenAc = (p: SearchPage, yer: KelimeYeri, w: HTMLElement) => {
    if (working || !p.record || !yazim || !o.duzenlenebilir?.()) return;
    duzenKapat();
    const rec = p.record, parca = parcaAl(rec, yer), k = parca && kelimeler(parca)[yer.kelime];
    if (!parca || !k?.oz) return;
    const kutu = document.createElement('span');
    kutu.id = 'ocrDuzelt';
    kutu.style.cssText = 'display:inline-flex;flex-wrap:wrap;gap:4px;align-items:center;margin:2px 4px;padding:4px;border:1px solid #567;border-radius:6px;background:#eef3f8;color:#17202a';
    const input = document.createElement('input');
    input.value = k.oz; input.setAttribute('aria-label', t('ocrPanel.dogruKelime'));
    input.autocapitalize = 'off'; input.spellcheck = false;
    input.style.cssText = 'font:16px system-ui;width:10em;min-height:36px';   // 16px: iOS does not zoom
    const dugme = (metin: string) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = metin; b.style.minHeight = '36px'; return b; };
    const kaydetB = dugme(t('ocrPanel.kaydet')), vazgecB = dugme(t('genel.vazgec'));
    kutu.append(input, kaydetB, vazgecB);
    const ham = yazildigiGibi(parca, yer.kelime);
    let geriB: HTMLButtonElement | null = null;
    if (ham !== null) { geriB = dugme(t('genel.geriAl')); geriB.title = t('ocrPanel.yazildigiGibi', { ham }); kutu.append(geriB); }
    const hedef: DuzeltmeHedefi = { parmakIzi: rec.parmakIzi, okunma: rec.okunma, satir: yer.satir, parca: yer.parca, metin: parca.metin, gosterilen: gosterilen(parca) };
    const kilit = (k: boolean) => { input.disabled = k; for (const b of kutu.querySelectorAll('button')) b.disabled = k; };
    const kaydet = (degistir: (x: OcrParca) => OcrParca, ne: string) => action(async () => {
      if (!yazim) throw new Error(t('ocrPanel.onceTekrar'));
      if (degistir(parca) === parca) { duzenKapat(); return; }   // nothing changed: no write
      kilit(true);
      try {
        await verify();
        status(t('ocrPanel.duzeltmeKaydediliyor'));
        const r = await duzeltmeYaz(yazim.drive, yazim.kaynak, hedef, degistir);
        const yeni = r.kayit.sayfalar.find(x => x.parmakIzi === rec.parmakIzi && x.okunma === rec.okunma);
        if (yeni && valid()) { p.record = yeni; p.text = aramaMetni(yeni); }
        showText(p);
        await o.duzeltildi?.(yazim.kaynak.id, r.kayit);
        status(ne);
      } finally { if (duzenKutu === kutu) kilit(false); }
    });
    const kaydetElle = () => {
      if (!input.value.trim()) { status(t('ocrPanel.kelimeBos')); return; }
      void kaydet(x => kelimeDegistir(x, yer.kelime, input.value), t('ocrPanel.duzeltmeKaydedildi'));
    };
    kaydetB.onclick = kaydetElle;
    vazgecB.onclick = () => duzenKapat();
    if (geriB) geriB.onclick = () => void kaydet(x => kelimeGeriAl(x, yer.kelime), t('ocrPanel.duzeltmeKaldirildi'));
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); kaydetElle(); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); duzenKapat(); }
    });
    w.after(kutu);
    duzenKutu = kutu;
    if (dokunmatik()) { host.style.bottom = 'auto'; host.style.top = '12px'; }
    host.scrollTop = Math.max(0, kutu.offsetTop - host.clientHeight / 3);
    input.focus({ preventScroll: true });
    input.select();
  };
  const drawList = () => {
    el('list').replaceChildren(...(search?.pages ?? []).map(p => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:4px 0';
      const etiket = document.createElement('span'); etiket.textContent = t('ocrPanel.satir', { no: p.number, durum: t(DURUM[p.state ?? 'okunacak']) });
      row.append(etiket);
      if (p.state === 'okundu') {
        const show = document.createElement('button'); show.textContent = t('ocrPanel.goster');
        show.onclick = () => showText(p);
        const again = document.createElement('button'); again.textContent = t('ocrPanel.tekrarOku'); again.dataset.again = String(p.number);
        again.onclick = () => {
          const uyari = p.record && tekrarOkuUyarisi(p.record);   // task 6.4e-3
          if (uyari && !confirm(uyari)) return;
          void read([p.number]);
        };
        row.append(show, again);
      }
      return row;
    }));
  };
  const read = (again: number[] = []) => action(async () => {
    if (!search || !valid()) throw new Error(t('ocrPanel.onceTekrar'));
    status(t('ocrPanel.okunuyor')); await search.start(again);
    const last = search.pages.filter(p => p.record).at(-1);
    if (last) showText(again.length ? search.pages.find(p => p.number === again[0]) ?? last : last);
    status(t('ocrPanel.okundu'));
  });

  el('prepare').onclick = () => void action(async () => {
    const now = snapshot(); if (!now || !currentToken()) throw new Error(t('ocrPanel.girisYap'));
    const numbers = el<HTMLInputElement>('pages').value.split(',').map(x => Number(x.trim()));
    if (numbers.some(n => !Number.isInteger(n) || n < 1)) throw new Error(t('ocrPanel.bicim'));
    const selected = numbers.map(number => {
      const found = now.pages.find(p => (p.page.pdfSayfa ?? 1) === number);
      if (!found || pageKind(found.page) !== 'pdf') throw new Error(t('ocrPanel.sayfaYok', { no: number }));
      return { number, index: found.index };
    });
    bound = now; boundEpoch = epoch; invalid = false;
    el('text').replaceChildren(); el('results').replaceChildren();
    status(t('ocrPanel.hazirlaniyor'));
    const page = (p: SearchPage) => now.pages.find(x => x.index === p.index)!.page;
    // the file once: its bytes (PDF cache), fingerprints, the record, its folder
    const gorseller = await PdfSayfaGorselleri.ac(new Uint8Array(await getPdf(now.file, now.version)));
    await verify();
    const meta = await (await ok(await driveFetch(`files/${encodeURIComponent(now.file)}?fields=name,parents`), t('okuyucuArama.dosyaBilgisi'))).json() as { name?: string; parents?: string[] };
    if (!meta.parents?.[0]) throw new Error(t('ocrPanel.klasorYok'));
    const kaynak: OcrKaynakDosya = { id: now.file, ad: meta.name ?? page({ number: 1, index: selected[0].index }).ad ?? 'dosya.pdf', klasorId: meta.parents[0] };
    const drive = driveOcrApi(now.yer);
    yazim = null;
    const kayit = (await kayitOkuDrive(drive, kaynak)).kayit;
    const eslesme = kayit ? eslestir(kayit, gorseller.izler).sayfalar : [];
    await verify();
    yazim = { drive, kaynak };
    search = new ReaderOcrSearch({ valid, verify,
      text: async p => (await now.content.textContent(page(p))).parcalar.map(x => x.str).join(' '),
      recorded: async p => eslesme[p.number - 1] ?? null,
      read: async (p, signal) => {
        const g = await gorseller.gorsel(p.number, () => cizJpeg(now.content, page(p)));
        const o = await okuApi(g.jpeg, { token: currentToken(), signal });
        return { sayfa: p.number, parmakIzi: g.parmakIzi, model: o.model, okunma: new Date().toISOString(), dondurme: 0, satirlar: o.satirlar } satisfies OcrSayfa;
      },
      save: async (_p, reading) => { await sayfaYaz(drive, kaynak, reading); o.okundu?.(kaynak.id); },
      progress: (d, toplam, p) => status(t('ocrPanel.ilerleme', { i: d, n: toplam, no: p.number }))
    });
    const count = await search.prepare(selected);
    el('count').textContent = t('ocrPanel.sayilar', { n: count, okundu: search.pages.filter(p => p.state === 'okundu').length, metin: search.pages.filter(p => p.state === 'metin').length });
    const first = search.pages.find(p => p.record);
    if (first) showText(first);
    status(t(count ? 'ocrPanel.okuyaBas' : 'ocrPanel.yeniYok'));
  });
  el('start').onclick = () => void read();
  el('cancel').onclick = () => { search?.cancel(); status(t('ocrPanel.iptalEdildi')); };
  el('search').onclick = () => void action(async () => {
    el('results').replaceChildren(); if (!search) throw new Error(t('ocrPanel.onceKontrol'));
    const matches = await search.matches(el<HTMLInputElement>('query').value);
    status(t('ocrPanel.eslesen', { n: matches.length }));
    for (const match of matches) {
      const button = document.createElement('button'); button.textContent = t('ocrPanel.sonuc', { no: match.page.number, tur: t(match.ocr ? 'ocrPanel.okunanTur' : 'ocrPanel.basiliTur'), metin: match.excerpt });
      button.style.cssText = 'display:block;text-align:left;margin:8px 0;white-space:normal';
      button.onclick = () => void action(async () => { await verify(); bound!.go(match.page.index); kapat(); });
      el('results').append(button);
    }
  });
  kurulu = { ac: () => { acik = true; host.hidden = false; }, kapat };
  return kurulu;
}
