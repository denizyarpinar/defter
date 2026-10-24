import { currentToken, prepareAuth, signIn, AuthError, authErrorMessage } from '../drive/auth';
import { getUser } from '../drive/drive';
import { hamMetin, yaziSatiriMi, type OcrParca, type OcrSatir } from '../ocr/kayit/sema';
import { scoreKnownTargets } from '../ocr/score';
import { FIYATLAR, MALIYET_NOTU, MODELLER, dolarYaz, maliyet, type OkuModel } from './maliyet';
import { jpegHazirla, kaynakAc, pdfMi, type Donus, type Hazir, type Kaynak } from './gorsel';

// 6.4b-AI measurement page (ocr-ai.html, dev only; not a build input). The image goes to
// /api/oku → Anthropic. Transcripts stay in this tab's DOM: no storage, no Drive request.
// 6.4c-1: lines are parts, each in its own colour (the record's shape, src/ocr/kayit/sema.ts); the plain
// text is built from the parts. The console helper window.defterOcrKayitDene is installed here (dev only).
interface Sonuc { satirlar: OcrSatir[]; sureMs: number; kullanim: { input_tokens: number; output_tokens: number } }

const RENK: Record<string, string> = { siyah: '#1b1b1b', mavi: '#1f4fbf', kirmizi: '#c0392b', yesil: '#1e8449', kursun: '#6b6b6b', diger: '#8e44ad' };

const app = document.getElementById('app')!;
if (!import.meta.env.DEV) {
  app.textContent = 'Bu sayfa yalnız geliştirmede çalışır.';
} else {
  kur();
  void import('../ocr/kayit/kayitDene').then(m => m.installOcrKayitDene());
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...cocuk: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'class' ? (e.className = v) : e.setAttribute(k, v);
  e.append(...cocuk);
  return e;
}

function kur(): void {
  const girisBtn = el('button', { id: 'giris' }, 'Google ile giriş');
  const girisDurum = el('span', { class: 'not', id: 'girisDurum' }, 'Giriş yok');
  const dosya = el('input', { id: 'dosya', type: 'file', accept: 'image/jpeg,image/png,image/webp,application/pdf' });
  const sayfa = el('input', { id: 'sayfa', type: 'number', min: '1', value: '1' });
  const sayfaEt = el('label', { class: 'gizli', id: 'sayfaEt' }, 'PDF sayfası ', sayfa);
  const donusler = el('span', { class: 'donus' });
  let donus: Donus = 0;
  for (const d of [0, 90, 180, 270] as Donus[]) {
    const b = el('button', { 'data-donus': String(d), 'aria-pressed': String(d === 0) }, `${d}°`);
    b.onclick = () => { donus = d; donusler.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); void hazirla(); };
    donusler.append(b);
  }
  const onizleme = el('img', { id: 'onizleme', alt: 'Modellere gönderilecek görsel' });
  const gorselBilgi = el('p', { class: 'not', id: 'gorselBilgi' }, 'Henüz dosya seçilmedi.');
  const hedef = el('textarea', { id: 'hedef', rows: '3', placeholder: 'Görselle doğrulanmış hedef kelimeler (isteğe bağlı; belirsiz kelimeleri yazma). Boşsa puan yok.' });
  const okuIkisi = el('button', { id: 'okuIkisi', class: 'ana' }, 'İki modelle oku');
  const okuTek = MODELLER.map(m => { const b = el('button', { 'data-model': m }, `Sadece ${FIYATLAR[m].ad}`); b.onclick = () => void oku([m]); return b; });
  const durum = el('p', { class: 'durum', id: 'durum', role: 'status' });
  const kartlar = el('div', { class: 'kartlar', id: 'kartlar' });

  app.append(
    el('h1', {}, 'El yazısı okuma · Claude · 6.4b'),
    el('p', { class: 'not' }, 'Yalnız geliştirme ve ölçüm. Görsel Anthropic’e gönderilir; okunan metin sadece bu sekmede kalır, hiçbir yere kaydedilmez.'),
    el('section', {}, el('h2', {}, '1. Giriş'), el('div', { class: 'satirlar' }, girisBtn, girisDurum)),
    el('section', {}, el('h2', {}, '2. Sayfa'),
      el('div', { class: 'satirlar' }, el('label', {}, 'Dosya ', dosya), sayfaEt, el('span', {}, 'Döndür: ', donusler)),
      gorselBilgi, onizleme),
    el('section', {}, el('h2', {}, '3. Hedef kelimeler'), hedef),
    el('section', {}, el('h2', {}, '4. Oku'), el('div', { class: 'satirlar' }, okuIkisi, ...okuTek), durum),
    kartlar
  );

  let kaynak: Kaynak | null = null, hazir: Hazir | null = null, onizlemeUrl = '', calisiyor = false;
  const dugmeler = () => [okuIkisi, ...okuTek];
  const kilitle = () => dugmeler().forEach(b => (b.disabled = calisiyor || !hazir));
  kilitle();
  void prepareAuth().catch(() => {});

  girisBtn.onclick = async () => {
    girisDurum.textContent = 'Bağlanıyor…';
    try {
      // this page only: always show Google's account list (no remembered hint)
      await signIn({ chooseAccount: true });
      girisDurum.textContent = 'Girişli (token sadece bellekte)';
      // which account: Drive about, shown in this page's DOM only; not stored, not logged
      try {
        const { email } = await getUser();
        girisDurum.textContent = `Girişli: ${email || 'e-posta alınamadı'} (token ve e-posta sadece bu sayfada)`;
      } catch {
        girisDurum.textContent = 'Girişli, ama hesap e-postası Drive’dan alınamadı.';
      }
    } catch (e) {
      girisDurum.textContent = e instanceof AuthError ? authErrorMessage(e.code) : 'Giriş yapılamadı.';
    }
  };

  async function ac(): Promise<void> {
    const f = dosya.files?.[0];
    kaynak?.kapat(); kaynak = null; hazir = null; kilitle();
    kartlar.replaceChildren();
    if (!f) return;
    sayfaEt.classList.toggle('gizli', !pdfMi(f));
    gorselBilgi.textContent = 'Açılıyor…';
    try {
      kaynak = await kaynakAc(f, Number(sayfa.value) || 1);
      await hazirla();
    } catch (e) { gorselBilgi.textContent = e instanceof Error ? e.message : 'Dosya açılamadı.'; }
  }
  dosya.onchange = () => void ac();
  sayfa.onchange = () => void ac();

  async function hazirla(): Promise<void> {
    if (!kaynak) return;
    hazir = null; kilitle(); kartlar.replaceChildren();
    hazir = await jpegHazirla(kaynak, donus);
    if (onizlemeUrl) URL.revokeObjectURL(onizlemeUrl);
    onizlemeUrl = URL.createObjectURL(hazir.blob);
    onizleme.src = onizlemeUrl;
    gorselBilgi.textContent = `Gönderilecek görsel: ${hazir.w}×${hazir.h} px · ${(hazir.blob.size / 1024).toFixed(0)} KB JPEG · ${donus}°`;
    kilitle();
  }

  okuIkisi.onclick = () => void oku(MODELLER);

  async function oku(modeller: OkuModel[]): Promise<void> {
    if (!hazir || calisiyor) return;
    const token = currentToken();
    if (!token) { durum.textContent = 'Önce Google ile giriş yap.'; return; }
    calisiyor = true; kilitle();
    const gorsel = hazir.base64;
    kartlar.replaceChildren();
    const hedefMetin = hedef.value.trim();
    try {
      for (const m of modeller) {   // one after the other: fair timing, gentle on the rate limit
        const kart = el('article', { class: 'kart', 'data-kart': m }, el('h3', {}, FIYATLAR[m].ad), el('p', { class: 'not' }, 'Okunuyor…'));
        kartlar.append(kart);
        durum.textContent = `${FIYATLAR[m].ad} okuyor…`;
        const t0 = performance.now();
        try {
          const r = await fetch('/api/oku', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ model: m, gorsel }) });
          const govde = await r.json().catch(() => null) as (Sonuc & { hata?: string; neden?: string; ipucu?: string; alanlar?: string[] }) | null;
          if (!govde) throw new Error(r.status === 404 ? 'api/oku bulunamadı. Sayfayı “vercel dev --listen 5173” ile aç.' : `Sunucu yanıtı okunamadı (durum ${r.status}).`);
          if (!r.ok) {
            const ek = [govde.neden && `neden: ${govde.neden}`, govde.ipucu, govde.alanlar && `tokeninfo alanları: ${govde.alanlar.join(', ') || '—'}`].filter(Boolean).join(' · ');
            throw new Error(`${govde.hata ?? `Hata (durum ${r.status}).`}${ek ? ` (${ek})` : ''}`);
          }
          kartDoldur(kart, m, govde, performance.now() - t0, hedefMetin);
        } catch (e) {
          kart.replaceChildren(el('h3', {}, FIYATLAR[m].ad), el('p', { class: 'hata' }, e instanceof Error ? e.message : 'Okunamadı.'));
        }
      }
      durum.textContent = 'Bitti.';
    } finally { calisiyor = false; kilitle(); }
  }
}

// model text only through text nodes, never as HTML
function metinEkle(e: HTMLElement, metin: string): void {
  metin.split('[?]').forEach((p, i) => { if (i) e.append(el('mark', {}, '[?]')); e.append(p); });
}

function parcaCiz(p: OcrParca): HTMLElement {
  const d = el('span', { class: `parca tur-${p.tur ?? 'yazi'}`, 'data-renk': p.renk });
  d.style.color = RENK[p.renk] ?? RENK.diger;
  if (p.ustuCizili) d.classList.add('ustu-cizili');
  metinEkle(d, p.metin);
  if (p.duzeltme !== undefined) d.append(el('small', { class: 'duzeltme' }, `→ ${p.duzeltme}`));
  return d;
}

function satirCiz(s: OcrSatir): HTMLElement {
  const d = el('div', { class: 'satir' });
  d.style.paddingLeft = `${s.girinti * 1.5}em`;
  if (!yaziSatiriMi(s)) {
    d.classList.add('tur-cizim');
    d.style.color = RENK.kursun;
    metinEkle(d, `[çizim: ${s.cizim}]`);
    return d;
  }
  s.parcalar.forEach((p, i) => { if (i) d.append(' '); d.append(parcaCiz(p)); });
  return d;
}

function kartDoldur(kart: HTMLElement, m: OkuModel, r: Sonuc, istemciMs: number, hedef: string): void {
  const ham = hamMetin(r);
  const parcalar = r.satirlar.flatMap(s => (yaziSatiriMi(s) ? s.parcalar : []));
  const formul = parcalar.filter(p => p.tur === 'formul').length;
  const cizim = r.satirlar.filter(s => !yaziSatiriMi(s)).length;
  const cokRenkli = r.satirlar.filter(s => yaziSatiriMi(s) && new Set(s.parcalar.map(p => p.renk)).size > 1).length;
  const belirsiz = (ham.match(/\[\?\]/g) ?? []).length;
  const puan = hedef ? scoreKnownTargets(hedef, ham) : null;
  const tutar = maliyet(m, r.kullanim);
  kart.replaceChildren(
    el('h3', {}, FIYATLAR[m].ad),
    el('dl', { class: 'olcum' },
      el('dt', {}, 'Süre'), el('dd', {}, `${(istemciMs / 1000).toFixed(1)} sn (model ${(r.sureMs / 1000).toFixed(1)} sn)`),
      el('dt', {}, 'Token'), el('dd', {}, `${r.kullanim.input_tokens} giriş / ${r.kullanim.output_tokens} çıkış`),
      el('dt', {}, 'Maliyet'), el('dd', {}, `${dolarYaz(tutar)} (${MALIYET_NOTU})`),
      el('dt', {}, 'Satır'), el('dd', { 'data-satir-sayisi': '' }, `${r.satirlar.length} · parça ${parcalar.length} · çok renkli satır ${cokRenkli} · formül ${formul} · çizim ${cizim} · [?] ${belirsiz}`),
      el('dt', {}, 'Hedef'), el('dd', { 'data-puan': '' }, puan ? `${puan.found}/${puan.total} · ${puan.metric}` : 'Hedef kelime yok')
    ),
    el('div', { class: 'sayfa' }, ...r.satirlar.map(satirCiz)),
    el('details', {}, el('summary', {}, 'Ham metin'), el('pre', {}, ham))
  );
}
