import { driveMetinAra } from '../drive/aramaDrive';
import { agacKur, type AgacOrtami } from './kitaplikAgaci';

// Task 6.3f, development only (loaded from main.ts under import.meta.env.DEV, not in the build):
//   window.defterDizinOlc(kelime) — every 30 s a Drive fullText query for the word (the Kitaplık folders
//   only), for at most 30 min; writes when it is found first and how long it took.
//   window.defterDizinOlc.dur() — stops it.
// Only GET requests to Drive (agacKur and driveMetinAra use saltOkunurFetch). Each round builds a new
// tree (not the search's tree in memory), so a file or folder added after the start is seen.
// The result goes to the console and to a box with "Kopyala" (iPad has no console).

const ne = 'defterDizinOlc';
const ARALIK_MS = 30_000;
const EN_FAZLA_MS = 30 * 60_000;

const saat = (t: number) => new Date(t).toLocaleTimeString('tr-TR');
const sure = (ms: number) => {
  const s = Math.round(Math.abs(ms) / 1000), isaret = ms < 0 ? '-' : '';
  return s < 60 ? `${isaret}${s} sn` : `${isaret}${Math.floor(s / 60)} dk ${s % 60} sn`;
};

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

let calisan: { dur: () => void } | null = null;

export function installDizinOlc(ortam: () => AgacOrtami | null): void {
  const olc = (kelime: string): void => {
    const o = ortam();
    if (!o) { console.warn(`${ne}: Drive kitaplığı yüklü değil (giriş yapıp bekle; örnek kitaplıkta arama yok).`); return; }
    const w = String(kelime ?? '').trim();
    if (!w) { console.warn(`${ne}: kelime boş. Örnek: defterDizinOlc('Zebrafink4711')`); return; }
    calisan?.dur();

    const satirlar: string[] = [];
    const yaz = (s: string) => { satirlar.push(s); console.log(`${ne}: ${s}`); kutu(satirlar); };
    const t0 = Date.now();
    let zamanlayici = 0, bitti = false, tur = 0;
    const dur = (neden?: string) => {
      if (bitti) return;
      bitti = true;
      clearTimeout(zamanlayici);
      if (calisan === kontrol) calisan = null;
      if (neden) yaz(neden);
    };
    const kontrol = { dur: () => dur(`durduruldu · ${saat(Date.now())} · ${sure(Date.now() - t0)} sonra`) };
    calisan = kontrol;

    yaz(`"${w}" aranıyor · başlangıç ${saat(t0)} · her ${ARALIK_MS / 1000} sn, en fazla ${EN_FAZLA_MS / 60_000} dk · sadece GET`);
    const turAt = async () => {
      if (bitti) return;
      tur++;
      const t = Date.now();
      try {
        const agac = await agacKur(o);
        const r = await driveMetinAra(w, agac.klasorIdleri);
        if (bitti) return;
        const adlar = new Map(agac.dosyalar.map(f => [f.id, f]));
        const bulunan = [...r.idler].map(id => adlar.get(id));
        if (r.idler.size) {
          const ilk = bulunan.find(Boolean);
          yaz(`tur ${tur} · ${saat(t)} · BULUNDU: ${r.idler.size} dosya`);
          for (const [i, id] of [...r.idler].entries()) {
            const f = bulunan[i];
            yaz(`  ${f ? `${f.kitap.baslik} › ${f.konu ? `${f.konu.baslik} › ` : ''}${f.ad}` : `(ağaçta yok: ${id})`}`);
          }
          yaz(`başlangıçtan geçen: ${sure(t - t0)}`);
          if (ilk) {
            const fark = t - Date.parse(ilk.modifiedTime);
            yaz(`dosyanın modifiedTime'ından (${saat(Date.parse(ilk.modifiedTime))}) geçen: ${sure(fark)}`);
            if (fark < 0) yaz('  UYARI: modifiedTime cihaz saatinden ileride (cihaz saati Drive\'ınkinden farklı); bu süre güvenilmez.');
          }
          if (tur === 1) yaz('  not: ilk turda bulundu; dizinleme ölçüm başlamadan bitmişti. Ölçüm için önce defterDizinOlc\'u başlat, sonra dosyayı ekle.');
          dur(`bitti · ${tur} tur`);
          return;
        }
        yaz(`tur ${tur} · ${saat(t)} · yok · ${sure(t - t0)} · ${r.istek} istek, ${agac.klasorIdleri.length} klasör, ${agac.dosyalar.length} PDF`);
      } catch (e) {
        yaz(`tur ${tur} · ${saat(t)} · HATA ${e instanceof Error ? e.message : String(e)}`);
      }
      if (Date.now() - t0 + ARALIK_MS > EN_FAZLA_MS) { dur(`${EN_FAZLA_MS / 60_000} dk doldu: "${w}" bulunamadı · ${tur} tur`); return; }
      zamanlayici = window.setTimeout(() => void turAt(), ARALIK_MS);
    };
    void turAt();
  };
  (window as unknown as { defterDizinOlc: typeof olc & { dur: () => void } }).defterDizinOlc = Object.assign(olc, { dur: () => calisan?.dur() });
}
