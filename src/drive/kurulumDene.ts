import type { AktifKapsam } from './kapsam';
import { driveKokApi, kokBul, type KokModu, type KokSonucu } from './kok';
import { driveKurulumApi, kitaplikKur, webOrnekKaynak, type KurulumSonucu } from './kurulum';

// Task 6.K2a, development only (loaded from main.ts under import.meta.env.DEV, not in the build):
// - window.defterKokDurumu(): where the library's root is (kokBul; GET only, writes nothing).
// - window.defterKurulumDene(islemId?, ornek = true): kitaplikKur — needs ?kurulum=1 (else KurulumKilitli, no request).
//   Without islemId a new one is made and logged; pass it again to retry the same set-up. ornek: the sample book (6.K3).

declare global {
  interface Window {
    defterKokDurumu?: () => Promise<{ mod: KokModu; kapsam: AktifKapsam | null; sonuc: KokSonucu }>;
    defterKurulumDene?: (islemId?: string, ornek?: boolean) => Promise<KurulumSonucu & { islemId: string }>;
  }
}

export function installKurulumDene(kapsam: () => AktifKapsam | null, yazabilir: () => boolean): void {
  const mod = (): KokModu => kapsam() === 'tam' ? 'tam' : 'dar';
  window.defterKokDurumu = async () => {
    const sonuc = { mod: mod(), kapsam: kapsam(), sonuc: await kokBul(driveKokApi, mod()) };
    console.log('defterKokDurumu', sonuc);
    return sonuc;
  };
  window.defterKurulumDene = async (islemId = crypto.randomUUID(), ornek = true) => {
    console.log('defterKurulumDene islemId', islemId);
    const kilitAcik = new URLSearchParams(location.search).get('kurulum') === '1';
    const ornekSecenek = ornek ? { kaynak: webOrnekKaynak(), ilerleme: (i: number, n: number) => console.log(`örnek kitap ${i}/${n}`) } : undefined;
    const sonuc = { ...await kitaplikKur(driveKurulumApi, { islemId, mod: mod(), kilitAcik, yazabilir, ornek: ornekSecenek }), islemId };
    console.log('defterKurulumDene', sonuc);
    return sonuc;
  };
}
