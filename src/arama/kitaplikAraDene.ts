import { MATERIAL_LABEL } from '../okuma/konuKesfi';
import { agacBellekte, agacAl, type AgacOrtami } from './kitaplikAgaci';
import { kitaplikAra, type KitaplikSonucu } from './kitaplikAra';

// Task 6.3d, development only (loaded from main.ts under import.meta.env.DEV, not in the build):
//   window.defterKitaplikAra(q) — searches the Drive library, logs the results and the times.
// Only GET requests to Drive. The result goes to the console and to a box with "Kopyala" (iPad has no console).

const ne = 'defterKitaplikAra';
const ms = (n: number) => `${Math.round(n)} ms`;

const satir = (r: KitaplikSonucu) => ({
  eslesme: r.eslesme,
  kitap: r.kitapBaslik,
  konu: r.konuBaslik ? `${r.uniteBaslik} › ${r.konuBaslik}` : r.konuDisi ? '(konu dışı)' : '',
  ad: r.eslesme === 'kitap' || r.eslesme === 'konu' ? '' : r.ad,
  materyal: r.materyal ? MATERIAL_LABEL[r.materyal] + (r.cozumMu ? ' (çözüm)' : '') : r.cozumMu ? '(çözüm)' : '',
  klasor: r.konuKlasor ?? '',
});

function kutu(satirlar: string[]): void {
  document.getElementById(ne)?.remove();
  const k = document.createElement('div');
  k.id = ne;
  k.style.cssText = 'position:fixed;left:16px;right:16px;bottom:16px;max-height:60vh;z-index:99999;display:flex;flex-direction:column;gap:8px;background:#fff;color:#111;border:1px solid #888;border-radius:8px;padding:10px;font:12px/1.4 ui-monospace,monospace';
  const pre = document.createElement('pre');
  pre.style.cssText = 'margin:0;overflow:auto;white-space:pre-wrap;flex:1';
  pre.textContent = satirlar.join('\n');
  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;gap:8px';
  const dugme = (metin: string, fn: (b: HTMLButtonElement) => void) => {
    const b = document.createElement('button');
    b.textContent = metin;
    b.style.cssText = 'padding:8px 12px;border-radius:6px;border:1px solid #888;background:#f4f4f4;cursor:pointer';
    b.addEventListener('click', () => fn(b));
    bar.append(b);
  };
  dugme('Kopyala', b => { void navigator.clipboard.writeText(satirlar.join('\n')).then(() => { b.textContent = 'Kopyalandı'; }); });
  dugme('✕', () => k.remove());
  k.append(pre, bar);
  document.body.append(k);
}

export function installKitaplikAra(ortam: () => AgacOrtami | null): void {
  (window as unknown as { defterKitaplikAra: (q: string) => Promise<KitaplikSonucu[]> }).defterKitaplikAra = async q => {
    const o = ortam();
    if (!o) { console.warn(`${ne}: Drive kitaplığı yüklü değil (giriş yapıp bekle; örnek kitaplıkta arama yok).`); return []; }
    const satirlar: string[] = [];
    const yaz = (s: string) => { satirlar.push(s); console.log(`${ne}: ${s}`); };
    const t0 = performance.now();
    try {
      const bellekten = agacBellekte(o);
      const r = await kitaplikAra(String(q ?? ''), o, {
        adGeldi: l => yaz(`ad sonuçları geldi: ${l.length} · aramanın başından ${ms(performance.now() - t0)}`),
      });
      const agac = await agacAl(o);
      const s = agac.sure;
      yaz(`"${r.q}" · ${r.sonuclar.length} sonuç · toplam ${ms(performance.now() - t0)}`);
      yaz(bellekten
        ? `ağaç: bellekten (0 istek; ${Math.round((Date.now() - agac.kuruldu) / 1000)} sn önce kuruldu)`
        : `ağaç: kuruldu · yöntem ${s.yontem === 'tekSorgu' ? 'tek klasör sorgusu' : "BFS ('in parents')"} · ${s.istek} istek · ${ms(s.ms)} · ${s.klasor} klasör · ${agac.dosyalar.length} PDF · ${agac.konular.length} konu (6.3a: 11 istek / 3,7 sn)`);
      yaz(`süreler: ağaç bekleme ${ms(r.sureler.agac)} · ad ${ms(r.sureler.ad)} · Drive ${ms(r.sureler.drive)} (${r.driveIstek} istek, ${agac.klasorIdleri.length} klasör)${r.eksik ? ' · Drive sonuçları eksik (2 sayfa sınırı)' : ''}`);
      if (r.driveHata) yaz(`Drive metin araması HATA: ${r.driveHata}`);
      const tablo = r.sonuclar.map(satir);
      console.table(tablo);
      for (const x of tablo) yaz(`  [${x.eslesme}] ${x.kitap}${x.konu ? ` › ${x.konu}` : ''}${x.ad ? ` › ${x.ad}` : ''}${x.materyal ? ` · ${x.materyal}` : ''}`);
      kutu(satirlar);
      return r.sonuclar;
    } catch (e) {
      yaz(`HATA ${e instanceof Error ? e.message : String(e)}`);
      kutu(satirlar);
      return [];
    }
  };
}
