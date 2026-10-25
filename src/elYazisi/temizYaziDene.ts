import { aktifKapsam, prepareAuth, signIn, AuthError, authErrorMessage } from '../drive/auth';
import { getUser, ok } from '../drive/drive';
import { saltOkunurFetch } from '../drive/saltOkunur';
import { kayitOku, type OcrKayit, type OcrSatir, type OcrSayfa } from '../ocr/kayit/sema';
import { closePdf, openPdf } from '../okuma/pdf';
import { atlasBellekTemizle, atlasOkuBellekli } from './atlasOkuDrive';
import { STILLER, type Stil } from './basici';
import { KAGITLAR, VARSAYILAN_KAGIT, type Kagit } from './dizgi';
import { temizSayfa, temizYaziciKur, type TemizYazici } from './temizSayfa';

// 6.4e-1 try-out page (temiz-yazi.html, dev only; not a build input, so it never ships).
// Sign in → the atlas from Drive (read only, atlasOkuDrive.ts) → (a) type text, pick colour / style / paper,
// see it printed; (b) pick a read PDF (its .ocr.json) and a page → clean page next to the original.
// Every Drive request is a GET (saltOkunurFetch). Timings in ms. The token stays in memory (auth.ts).

const app = document.getElementById('app')!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...cocuk: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'class' ? (e.className = v) : e.setAttribute(k, v);
  e.append(...cocuk);
  return e;
}
const secim = (id: string, degerler: readonly string[], secili: string) =>
  el('select', { id }, ...degerler.map(v => { const o = el('option', { value: v }, v); o.selected = v === secili; return o; }));

const hata = (e: unknown) => e instanceof AuthError ? authErrorMessage(e.code) : e instanceof Error ? e.message : String(e);
const A4 = { en: 595, boy: 842 };
const ORNEK_METIN = 'Kuvvet ağırlık öğrenci Şekil üç İçerik\n  Beispiele für Kräfte: Gewichtskraft, Reibung\n  $F = m \\cdot a$ ve $\\vec{v}_0$\n[çizim: kutuya etki eden kuvvetler]';

// Typed text → a page: two leading spaces = one indent level, $…$ = formula, ~~…~~ = struck through,
// a line "[çizim: …]" = a drawing
export function metindenSayfa(metin: string, renk: string): Pick<OcrSayfa, 'satirlar'> {
  const satirlar: OcrSatir[] = metin.split('\n').map(s => {
    const girinti = Math.floor((/^ */.exec(s)![0].length) / 2);
    const govde = s.trim();
    const c = /^\[çizim:\s*(.*)\]$/.exec(govde);
    if (c) return { girinti, cizim: c[1] };
    const parcalar = govde.split(/(\$[^$]*\$|~~[^~]*~~)/).filter(Boolean).map(p =>
      p.startsWith('$') ? { metin: p.slice(1, -1), renk: renk as 'mavi', tur: 'formul' as const }
        : p.startsWith('~~') ? { metin: p.slice(2, -2), renk: renk as 'mavi', ustuCizili: true }
          : { metin: p.trim(), renk: renk as 'mavi' }).filter(p => p.metin);
    return { girinti, parcalar };
  });
  return { satirlar };
}

function kur(): void {
  const girisBtn = el('button', { id: 'giris' }, 'Google ile giriş');
  const girisDurum = el('span', { class: 'not' }, 'Giriş yok');
  const atlasDurum = el('p', { class: 'not', id: 'atlasDurum' }, 'Atlas girişten sonra Drive\'dan okunur.');
  const metin = el('textarea', { id: 'metin', rows: '6' });
  metin.value = ORNEK_METIN;
  const renkSec = secim('renk', ['mavi'], 'mavi');
  const stilSec = secim('stil', STILLER, 'tukenmez');
  const kagitSec = secim('kagit', KAGITLAR, VARSAYILAN_KAGIT);
  const oynamaKutu = el('input', { id: 'oynama', type: 'checkbox' });
  oynamaKutu.checked = true;
  const canliTuval = el('canvas', { id: 'canli', class: 'sayfa' });
  const canliSure = el('p', { class: 'not', id: 'canliSure' });
  const ocrSec = el('select', { id: 'ocr' }, el('option', { value: '' }, '— önce giriş —'));
  const sayfaSec = el('select', { id: 'sayfaNo' });
  const ocrDurum = el('p', { class: 'not', id: 'ocrDurum' });
  const temizTuval = el('canvas', { id: 'temiz', class: 'sayfa' });
  const orijinalTuval = el('canvas', { id: 'orijinal', class: 'sayfa' });
  const ikiliSure = el('p', { class: 'not', id: 'ikiliSure' });

  app.append(
    el('h1', {}, 'Temiz yazı · deneme · 6.4e-1'),
    el('p', { class: 'not' }, 'Yalnız geliştirme. Drive\'a hiçbir şey yazılmaz (sadece okuma).'),
    el('section', {}, el('h2', {}, '1. Giriş ve atlas'), el('div', { class: 'satirlar' }, girisBtn, girisDurum), atlasDurum),
    el('section', {}, el('h2', {}, '2. Canlı basma'),
      el('p', { class: 'not' }, 'İki boşluk = bir girinti · $…$ = formül · ~~…~~ = üstü çizili · [çizim: …] = çizim satırı'),
      metin,
      el('div', { class: 'satirlar' }, el('label', {}, 'Renk ', renkSec), el('label', {}, 'Stil ', stilSec),
        el('label', {}, 'Kâğıt ', kagitSec), el('label', {}, oynamaKutu, ' oynama')),
      canliSure, canliTuval),
    el('section', {}, el('h2', {}, '3. Okunmuş sayfa'),
      el('div', { class: 'satirlar' }, el('label', {}, 'Dosya ', ocrSec), el('label', {}, 'Sayfa ', sayfaSec)),
      ocrDurum, ikiliSure, el('div', { class: 'ikili' }, temizTuval, orijinalTuval))
  );

  let yazici: TemizYazici | null = null;
  let kayit: OcrKayit | null = null;
  let pdf: { id: string; bytes: ArrayBuffer } | null = null;
  const ayar = () => ({ stil: stilSec.value as Stil, kagit: kagitSec.value as Kagit, oynama: oynamaKutu.checked });
  const piksel = (tuval: HTMLCanvasElement, en: number, boy: number) => {
    const css = Math.min(tuval.parentElement!.clientWidth || 600, 720);
    const dpr = Math.min(devicePixelRatio || 1, 2);
    tuval.style.width = `${css}px`;
    return { genislik: css * dpr, yukseklik: css * dpr * boy / en };
  };

  const canliCiz = () => {
    if (!yazici) return;
    try {
      const r = temizSayfa(canliTuval, yazici, metindenSayfa(metin.value, renkSec.value), { ...A4, ...piksel(canliTuval, A4.en, A4.boy), ...ayar() });
      canliSure.textContent = `dizgi ${r.sure.dizgi} ms · glif hazırlama ${r.sure.glif} ms (${r.yeniGlif} yeni) · çizim ${r.sure.cizim} ms · xh ${r.dizgi.xh.toFixed(1)}`
        + ` · eksik: ${r.dizgi.eksik.join(' ') || 'yok'}${r.dizgi.kesildi ? ' · KESİLDİ' : ''}`;
    } catch (e) { canliSure.textContent = hata(e); }
  };
  for (const g of [metin, renkSec, stilSec, kagitSec, oynamaKutu]) g.addEventListener('input', () => { canliCiz(); void ikiliCiz(); });

  void prepareAuth().catch(e => { girisDurum.textContent = hata(e); });

  girisBtn.onclick = async () => {
    girisDurum.textContent = 'Bağlanıyor…';
    try {
      await signIn({ chooseAccount: true });
      atlasBellekTemizle();
      let eposta = 'e-posta alınamadı';
      try { eposta = (await getUser()).email || eposta; } catch { /* only shown */ }
      girisDurum.textContent = `Girişli: ${eposta} · kapsam ${aktifKapsam() ?? '?'}`;
      atlasDurum.textContent = 'Atlas okunuyor…';
      const okunan = await atlasOkuBellekli();
      if (!okunan) { atlasDurum.textContent = 'Drive\'da atlas yok (kök/_sistem/el-yazisi/). Önce atlas-yukle.html ile yükle.'; return; }
      yazici = await temizYaziciKur(okunan.atlas, new Blob([okunan.png as Uint8Array<ArrayBuffer>], { type: 'image/png' }));
      const a = okunan.atlas;
      renkSec.replaceChildren(...Object.keys(a.renkler).map(r => el('option', { value: r }, r)));
      renkSec.value = a.renkler.mavi ? 'mavi' : Object.keys(a.renkler)[0];
      atlasDurum.textContent = `Atlas: ${Object.keys(a.karakterler).length} karakter, sayfa ${a.sayfa.w}×${a.sayfa.h}, ${a.kodlama} · `
        + `indirme ${okunan.sure.indirme} ms · PNG çözme ${yazici.sure.coz} ms${okunan.uyarilar.length ? ' · uyarı: ' + okunan.uyarilar.join(' ') : ''}`;
      canliCiz();
      await ocrListele();
    } catch (e) {
      atlasDurum.textContent = hata(e);
    }
  };

  // every .ocr.json the app made (read only), labelled "<folder>/<file>"
  async function ocrListele(): Promise<void> {
    ocrDurum.textContent = 'Okuma kayıtları aranıyor…';
    const q = "appProperties has { key='defter' and value='1' } and appProperties has { key='defterOcr' and value='1' } and trashed = false";
    const p = new URLSearchParams({ q, fields: 'files(id,name,parents,appProperties)', pageSize: '100', orderBy: 'modifiedTime desc' });
    const j = await (await ok(await saltOkunurFetch('files?' + p), 'Okuma kayıtları aranırken')).json() as { files?: { id: string; name: string; parents?: string[]; appProperties?: Record<string, string> }[] };
    const dosyalar = j.files ?? [];
    const adlar = new Map<string, string>();
    for (const f of dosyalar) {
      const eb = f.parents?.[0];
      if (eb && !adlar.has(eb)) {
        const r = await ok(await saltOkunurFetch(`files/${encodeURIComponent(eb)}?fields=name`), 'Klasör adı okunurken');
        adlar.set(eb, (await r.json() as { name: string }).name);
      }
    }
    ocrSec.replaceChildren(el('option', { value: '' }, dosyalar.length ? '— seç —' : '— okunmuş sayfa yok —'),
      ...dosyalar.map(f => el('option', { value: f.id }, `${adlar.get(f.parents?.[0] ?? '') ?? '?'}/${f.name}`)));
    ocrDurum.textContent = `${dosyalar.length} okuma kaydı.`;
  }

  ocrSec.onchange = async () => {
    kayit = null; pdf = null; sayfaSec.replaceChildren();
    if (!ocrSec.value) return;
    try {
      ocrDurum.textContent = 'Okuma kaydı ve PDF indiriliyor…';
      const t0 = performance.now();
      const metinJ = await (await ok(await saltOkunurFetch(`files/${encodeURIComponent(ocrSec.value)}?alt=media`), 'Okuma kaydı okunurken')).text();
      kayit = kayitOku(JSON.parse(metinJ));
      const b = await (await ok(await saltOkunurFetch(`files/${encodeURIComponent(kayit.kaynak.id)}?alt=media`), 'PDF indirilirken')).arrayBuffer();
      pdf = { id: kayit.kaynak.id, bytes: b };
      sayfaSec.replaceChildren(...[...kayit.sayfalar].sort((a, c) => a.sayfa - c.sayfa).map(s => el('option', { value: String(s.sayfa) }, `s.${s.sayfa} (${s.satirlar.length} satır)`)));
      ocrDurum.textContent = `${kayit.kaynak.ad}: ${kayit.sayfalar.length} okunmuş sayfa · indirme ${Math.round(performance.now() - t0)} ms`;
      await ikiliCiz();
    } catch (e) { ocrDurum.textContent = hata(e); }
  };
  sayfaSec.onchange = () => void ikiliCiz();

  async function ikiliCiz(): Promise<void> {
    if (!yazici || !kayit || !pdf || !sayfaSec.value) return;
    const s = kayit.sayfalar.find(x => x.sayfa === Number(sayfaSec.value));
    if (!s) return;
    try {
      const t0 = performance.now();
      const doc = await openPdf(pdf.bytes);
      try {
        const page = await doc.getPage(s.sayfa);
        const v1 = page.getViewport({ scale: 1, rotation: (page.rotate + s.dondurme) % 360 });
        const boyut = piksel(orijinalTuval, v1.width, v1.height);
        const v = page.getViewport({ scale: boyut.genislik / v1.width, rotation: (page.rotate + s.dondurme) % 360 });
        orijinalTuval.width = Math.round(v.width); orijinalTuval.height = Math.round(v.height);
        const ctx = orijinalTuval.getContext('2d')!;
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, v.width, v.height);
        await page.render({ canvas: orijinalTuval, canvasContext: ctx, viewport: v, annotationMode: 0 }).promise;
        const tPdf = Math.round(performance.now() - t0);
        const r = temizSayfa(temizTuval, yazici, s, { en: v1.width, boy: v1.height, ...piksel(temizTuval, v1.width, v1.height), ...ayar() });
        ikiliSure.textContent = `orijinal çizim ${tPdf} ms · dizgi ${r.sure.dizgi} ms · glif hazırlama ${r.sure.glif} ms (${r.yeniGlif} yeni) · `
          + `çizim ${r.sure.cizim} ms · xh ${r.dizgi.xh.toFixed(1)} · eksik: ${r.dizgi.eksik.join(' ') || 'yok'}${r.dizgi.kesildi ? ' · KESİLDİ' : ''}`;
      } finally { await closePdf(doc); }
    } catch (e) { ikiliSure.textContent = hata(e); }
  }
}

// started last: the constants above must exist first
if (!import.meta.env.DEV) app.textContent = 'Bu sayfa yalnız geliştirmede çalışır.';
else kur();
