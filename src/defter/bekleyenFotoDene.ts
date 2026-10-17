import { bekleyenFotoDepo } from './bekleyenFoto';
import { kayitBoyutu, toplamBoyut, yeniKayit, yuklemeBasla, yuklemeHata, type BekleyenJpeg } from './bekleyenFotoKayit';

// Task 5.8e, development only (loaded from main.ts under import.meta.env.DEV, not in the build):
// window.defterBekleyenFoto() shows the pending photo records as a table. For trying the store:
// .dene(n) saves a test record with n small JPEGs, .hata(islemId) starts and fails an upload,
// .basla(islemId) only starts one (reload the page: it is 'bekliyor' again), .sil(islemId) removes it.
// Nothing goes to Drive.

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

async function denemeJpeg(i: number): Promise<BekleyenJpeg> {
  const c = document.createElement('canvas');
  c.width = 600; c.height = 800;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fbf7ef'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#2a2a2a'; g.font = '700 48px sans-serif';
  g.fillText(`Deneme 5.8e · ${i + 1}`, 40, 120);
  const blob = await new Promise<Blob | null>(r => c.toBlob(r, 'image/jpeg', 0.85));
  if (!blob) throw new Error('Deneme görseli üretilemedi.');
  return { bytes: new Uint8Array(await blob.arrayBuffer()), width: c.width, height: c.height };
}

const hataYaz = (e: unknown) => console.error(`defterBekleyenFoto: ${e instanceof Error ? e.message : String(e)}`);

async function tablo(): Promise<void> {
  try {
    const ks = await bekleyenFotoDepo.hepsi();
    console.table(ks.map(k => ({
      islemId: k.islemId, konu: `${k.kitapAdi} / ${k.konuBaslik}`, hedef: k.hedefAd, foto: k.jpegler.length,
      boyut: kb(kayitBoyutu(k)), durum: k.durum, deneme: k.deneme, sonHata: k.sonHata ?? '',
    })));
    console.log(`defterBekleyenFoto: ${ks.length} kayıt · toplam ${kb(toplamBoyut(ks))}`);
  } catch (e) { hataYaz(e); }
}

export function installBekleyenFoto(): void {
  const f = Object.assign(tablo, {
    async dene(n = 2) {
      try {
        const jpegler = await Promise.all(Array.from({ length: n }, (_, i) => denemeJpeg(i)));
        const k = yeniKayit({ kitapAdi: 'deneme', konuKlasorId: 'deneme-konu', konuBaslik: 'Deneme konusu', hedefAd: 'ozet.pdf', jpegler },
          new Date().toISOString());
        await bekleyenFotoDepo.kaydet(k);
        console.log(`defterBekleyenFoto: kaydedildi · islemId = ${k.islemId}`);
        await tablo();
        return k.islemId;
      } catch (e) { hataYaz(e); return null; }
    },
    async basla(islemId: string) {
      try {
        await bekleyenFotoDepo.durumGuncelle(islemId, k => yuklemeBasla(k, new Date().toISOString()));
        await tablo();
      } catch (e) { hataYaz(e); }
    },
    async hata(islemId: string, mesaj = 'Deneme hatası (ağ yok)') {
      try {
        const simdi = new Date().toISOString();
        await bekleyenFotoDepo.durumGuncelle(islemId, k => yuklemeHata(k.durum === 'yukleniyor' ? k : yuklemeBasla(k, simdi), mesaj, simdi));
        await tablo();
      } catch (e) { hataYaz(e); }
    },
    async sil(islemId: string) {
      try {
        await bekleyenFotoDepo.sil(islemId);
        await tablo();
      } catch (e) { hataYaz(e); }
    },
  });
  (window as unknown as { defterBekleyenFoto: typeof f }).defterBekleyenFoto = f;
}
