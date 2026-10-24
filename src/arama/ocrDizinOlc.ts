import { qv } from '../drive/drive';
import { driveMetinAra, listele, parcala, parentsKosulu } from '../drive/aramaDrive';
import { saltOkunurFetch } from '../drive/saltOkunur';
import { duzeltilmisMetin, hamMetin, kayitOku, yaziSatiriMi, type OcrKayit } from '../ocr/kayit/sema';
import { agacKur, type AgacOrtami } from './kitaplikAgaci';

// Task 6.4c-3 (A), development only (loaded from main.ts under import.meta.env.DEV, not in the build):
//   window.defterOcrDizinOlc(kelime?) — does Drive's fullText find the words inside the .ocr.json files?
// 1. the tree (agacKur) → the .ocr.json files (appProperties defterOcr=1) in the Kitaplık folders
// 2. each file's text (hamMetin / duzeltilmisMetin); without a word: up to 3 test words per file
//    (one with an umlaut, one only in a correction, a long one)
// 3. per word: fullText in that folder only, and the app's own query (driveMetinAra); umlaut words also as "ae"
// Only GET requests (saltOkunurFetch). The result goes to the console and to a box with "Kopyala".

const ne = 'defterOcrDizinOlc';
const ALANLAR = 'id,name,mimeType,modifiedTime,createdTime,parents,size,appProperties';

interface OcrDosyasi {
  id: string; name: string; mimeType: string; modifiedTime: string; createdTime: string;
  parents?: string[]; size?: string; appProperties?: Record<string, string>;
}

interface Kelime { w: string; neden: string }

const UMLAUT = /[äöüÄÖÜß]/u;
const AE: Record<string, string> = { 'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss' };
const aeYaz = (w: string) => w.replace(/[äöüÄÖÜß]/gu, c => AE[c]);
const saat = (t: number) => new Date(t).toLocaleTimeString('tr-TR');

// Words of a text: letters only (no LaTeX, no numbers), at least 5 letters
const kelimeler = (s: string) => new Set(s.match(/\p{L}{5,}/gu) ?? []);

// The record's text without formulas (LaTeX would give words like "frac")
function yaziMetni(k: OcrKayit, duzeltilmis: boolean): string {
  const s = k.sayfalar.map(p => ({
    satirlar: p.satirlar.map(x => yaziSatiriMi(x) ? { ...x, parcalar: x.parcalar.filter(y => y.tur !== 'formul') } : x),
  }));
  return s.map(p => (duzeltilmis ? duzeltilmisMetin : hamMetin)(p)).join('\n').replace(/\[çizim:[^\]]*\]/gu, ' ');
}

export function testKelimeleri(k: OcrKayit, dosyaAdi: string): Kelime[] {
  const ham = kelimeler(yaziMetni(k, false)), duz = kelimeler(yaziMetni(k, true));
  const adda = (w: string) => dosyaAdi.toLowerCase().includes(w.toLowerCase());
  const secilen: Kelime[] = [];
  const ekle = (w: string | undefined, neden: string) => { if (w && !secilen.some(x => x.w === w)) secilen.push({ w, neden }); };
  ekle([...ham, ...duz].find(w => UMLAUT.test(w) && !adda(w)), 'umlautlu');
  ekle([...duz].find(w => !ham.has(w) && !adda(w)), 'sadece düzeltmede');
  ekle([...ham].filter(w => !adda(w) && !secilen.some(x => x.w === w)).sort((a, b) => b.length - a.length)[0], 'uzun kelime');
  return secilen;
}

function kutu(satirlar: string[]): void {
  let k = document.getElementById(ne);
  let pre = k?.querySelector('pre');
  if (!k || !pre) {
    k?.remove();
    k = document.createElement('div');
    k.id = ne;
    k.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;max-height:60vh;z-index:99999;display:flex;flex-direction:column;gap:8px;background:#fff;color:#111;border:1px solid #888;border-radius:8px;padding:10px;font:12px/1.4 ui-monospace,monospace';
    pre = document.createElement('pre');
    pre.style.cssText = 'margin:0;overflow:auto;white-space:pre-wrap;flex:1';
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px';
    const dugme = (metin: string, fn: (b: HTMLButtonElement) => void) => {
      const b = document.createElement('button');
      b.textContent = metin;
      b.style.cssText = 'padding:8px 12px;border-radius:6px;border:1px solid #888;background:#f4f4f4;cursor:pointer';
      b.addEventListener('click', () => fn(b));
      bar.append(b);
    };
    const p = pre;
    dugme('Kopyala', b => { void navigator.clipboard.writeText(p.textContent ?? '').then(() => { b.textContent = 'Kopyalandı'; }); });
    dugme('✕', () => k?.remove());
    k.append(pre, bar);
    document.body.append(k);
  }
  pre.textContent = satirlar.join('\n');
  pre.scrollTop = pre.scrollHeight;
}

// fullText for one word in one folder → the ids Drive gives
async function klasordeAra(w: string, klasorId: string): Promise<Set<string>> {
  const q = [`fullText contains '${qv(w)}'`, `'${qv(klasorId)}' in parents`, 'trashed = false'].join(' and ');
  const r = await listele<{ id: string }>(saltOkunurFetch, q, 'id', { pageSize: 100, enFazlaSayfa: 2, ne: 'Ölçüm' });
  return new Set(r.dosyalar.map(f => f.id));
}

export function installOcrDizinOlc(ortam: () => AgacOrtami | null): void {
  const olc = async (kelime?: string): Promise<void> => {
    const o = ortam();
    if (!o) { console.warn(`${ne}: Drive kitaplığı yüklü değil (giriş yapıp bekle; örnek kitaplıkta arama yok).`); return; }
    const satirlar: string[] = [];
    const yaz = (s: string) => { satirlar.push(s); console.log(`${ne}: ${s}`); kutu(satirlar); };
    const t0 = Date.now();
    yaz(`başlangıç ${saat(t0)} · sadece GET`);
    try {
      const agac = await agacKur(o);
      yaz(`ağaç: ${agac.kitaplar.length} kitap, ${agac.dosyalar.length} PDF, ${agac.klasorIdleri.length} PDF'li klasör`);
      const pdfler = new Map(agac.dosyalar.map(f => [f.id, f]));

      // 1. the .ocr.json files in those folders
      const r = await Promise.all(parcala(agac.klasorIdleri).map(g => listele<OcrDosyasi>(saltOkunurFetch,
        `${parentsKosulu(g)} and appProperties has { key='defterOcr' and value='1' } and trashed = false`, ALANLAR,
        { pageSize: 100, enFazlaSayfa: 10, ne: 'Okuma kayıtları aranırken' })));
      const ocrler = r.flatMap(x => x.dosyalar);
      yaz(`.ocr.json: ${ocrler.length} dosya`);
      if (!ocrler.length) { yaz('Okuma kaydı bulunamadı. Önce okuyucudan bir sayfa oku (?ocrKayit=1).'); return; }

      const tablo: string[] = [];
      let bulunan = 0, denenen = 0;
      for (const f of ocrler) {
        const kaynak = pdfler.get(f.appProperties?.defterOcrKaynak ?? '');
        const yer = kaynak ? `${kaynak.kitap.baslik} › ${kaynak.konu?.baslik ?? '(konu dışı)'} › ${f.name}` : `(kaynak PDF ağaçta yok) › ${f.name}`;
        yaz('');
        yaz(`■ ${yer}`);
        yaz(`  mimeType ${f.mimeType} · ${f.size ?? '?'} bayt · oluşturma ${f.createdTime} · değişme ${f.modifiedTime} (${Math.round((t0 - Date.parse(f.modifiedTime)) / 60_000)} dk önce)`);
        const klasor = f.parents?.[0];
        if (!klasor) { yaz('  klasör bilgisi yok, atlandı'); continue; }

        // 2. the text and the test words
        const res = await saltOkunurFetch(`files/${encodeURIComponent(f.id)}?alt=media`);
        if (!res.ok) { yaz(`  okunamadı (HTTP ${res.status}), atlandı`); continue; }
        let kayit: OcrKayit;
        try { kayit = kayitOku(JSON.parse(await res.text())); } catch (e) { yaz(`  bozuk: ${e instanceof Error ? e.message : String(e)}`); continue; }
        yaz(`  ${kayit.sayfalar.length} okunmuş sayfa (s. ${kayit.sayfalar.map(s => s.sayfa).join(', ')})`);
        const liste: Kelime[] = kelime?.trim() ? [{ w: kelime.trim(), neden: 'verilen' }] : testKelimeleri(kayit, f.name);
        if (!liste.length) { yaz('  ≥ 5 harfli kelime yok, atlandı'); continue; }

        // 3. the queries
        const denemeler = liste.flatMap(k => UMLAUT.test(k.w) ? [k, { w: aeYaz(k.w), neden: `${k.neden}, ae yazımı` }] : [k]);
        for (const k of denemeler) {
          denenen++;
          const [klasorde, uygulama] = await Promise.all([klasordeAra(k.w, klasor), driveMetinAra(k.w, agac.klasorIdleri)]);
          const json = klasorde.has(f.id), jsonUyg = uygulama.idler.has(f.id);
          const pdf = !!kaynak && klasorde.has(kaynak.id);
          if (json) bulunan++;
          const satir = `  "${k.w}" (${k.neden}): klasörde JSON ${json ? 'VAR' : 'yok'} · uygulamanın sorgusunda JSON ${jsonUyg ? 'VAR' : 'yok'} · PDF'in kendisinde ${pdf ? 'var' : 'yok'} · klasörde ${klasorde.size} sonuç`;
          yaz(satir);
          tablo.push(`${f.name} | ${k.w} | ${k.neden} | JSON ${json ? 'VAR' : 'yok'} | uyg. ${jsonUyg ? 'VAR' : 'yok'} | PDF ${pdf ? 'var' : 'yok'}`);
        }
      }
      yaz('');
      yaz(`ÖZET · ${saat(Date.now())} · ${Math.round((Date.now() - t0) / 1000)} sn`);
      for (const s of tablo) yaz(`  ${s}`);
      yaz(bulunan
        ? `Drive fullText ${denenen} denemenin ${bulunan}'ında .ocr.json'u buldu (application/json dizinleniyor).`
        : `Drive fullText ${denenen} denemenin hiçbirinde .ocr.json'u bulmadı.`);
    } catch (e) {
      yaz(`HATA ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  (window as unknown as { defterOcrDizinOlc: typeof olc }).defterOcrDizinOlc = olc;
}
