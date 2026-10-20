import { eklemeMi, IcindekilerKuyrugu, yeniIs, type IcindekilerDrive, type IcindekilerIsi, type IcindekilerSecenek, type KayitDurumu } from '../drive/icindekilerYaz';
import { kitabaUygula, kitabiEsitle, type IcindekilerIslemi } from '../kitap/icindekiler';
import type { Book } from '../model/types';
import type { IcindekilerBaglami } from './icindekilerDuzenle';

// Task 6.K5a-2: the contents' edit mode tied to the write queue (was in main.ts). No DOM, tested.
// - One way for every write: the first try and "Tekrar dene" both end in `basarili` → the book in memory (adding),
//   yenile (search tree, desk pages) → every listener (the reader redraws its panel). A failing refresh or listener
//   never turns a change already in Drive into an error.
// - "Vazgeç" on a name / order: the screen goes back to Drive (kitap.json read again, the changes still waiting put
//   on top); kitap.json can't be read → the change is undone in memory (`geri`, taken before it was made).
// - iz: the last events, for the ?olcum=1 box (the iPad has no console).

export interface BaglamGirdisi {
  drive: IcindekilerDrive;
  secenek: (kitapId: string) => IcindekilerSecenek;
  kilitAcik: boolean;
  hasJson(b: Book): boolean;
  uniteKlasorleri(b: Book): Promise<(string | null)[]>;
  kitap(id: string): Book | undefined;
  yenile(): void;                           // the search tree and the desk's pages
  jsonOku(kitapId: string): Promise<unknown>;
  girisYap(): void;
  islemId?: () => string;
}

export interface IcindekilerBaglantisi {
  baglam: IcindekilerBaglami;
  kuyruk: IcindekilerKuyrugu;
  vazgec(): Promise<void>;                  // as baglam.vazgec; resolves when the screen is back to Drive
  iz(): string;
}

const IZ_UZUNLUK = 6;
let sonIz: (() => string) | null = null;

// The ?olcum=1 line of the context in use
export const icindekilerIzi = (): string => sonIz?.() ?? '–';

export function icindekilerBaglamiKur(o: BaglamGirdisi): IcindekilerBaglantisi {
  let durum: KayitDurumu = { tur: 'bos' };
  const dinleyiciler = new Set<() => void>();
  const geriler = new Map<IcindekilerIsi, IcindekilerIslemi>();
  const olaylar: string[] = [];
  const iz = (olay: string) => {
    const d = new Date();
    olaylar.push(`${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')} ${olay}`);
    if (olaylar.length > IZ_UZUNLUK) olaylar.shift();
  };
  const haber = () => {
    for (const f of [...dinleyiciler]) {
      try { f(); } catch (e) { iz('dinleyici hata'); console.warn('İçindekiler paneli çizilemedi.', e); }
    }
  };
  const yenile = () => {
    try { o.yenile(); } catch (e) { iz('yenile hata'); console.warn('İçindekiler: sayfa yenilenemedi.', e); }
  };
  const uygula = (b: Book, islem: IcindekilerIslemi) => {
    try { kitabaUygula(b, islem); } catch (e) { console.warn('İçindekiler: bellekteki kitap güncellenemedi.', e); }
  };

  const kuyruk = new IcindekilerKuyrugu({
    drive: o.drive,
    secenek: o.secenek,
    durum: d => { iz('durum ' + d.tur); durum = d; haber(); },
    basarili: (is, islem) => {
      iz('basarılı ' + is.istek.tur);
      geriler.delete(is);
      // adding: the book in memory changes only now (names and order changed at once)
      const b = o.kitap(is.kitapId);
      if (b && eklemeMi(is)) uygula(b, islem);
      yenile();
      haber();
    }
  });

  async function vazgec(): Promise<void> {
    const is = kuyruk.vazgec();
    iz('vazgeç' + (is ? ' ' + is.istek.tur : ' (iş yok)'));
    if (!is) return;
    const geri = geriler.get(is);
    geriler.delete(is);
    const b = o.kitap(is.kitapId);
    if (!b || eklemeMi(is)) { haber(); return; }   // adding: it never was in the list
    try {
      kitabiEsitle(b, await o.jsonOku(is.kitapId));
      // the changes still waiting are not in the file yet: they stay on the screen
      for (const p of kuyruk.bekleyenler) if (p.kitapId === b.id && !eklemeMi(p) && p.islem) uygula(b, p.islem);
      iz('Drive\'daki hale dönüldü');
    } catch (e) {
      console.warn('İçindekiler: kitap.json okunamadı; değişiklik geri alındı.', e);
      if (geri) uygula(b, geri);
      iz('işlem öncesine dönüldü');
    }
    yenile();
    haber();
  }

  const baglam: IcindekilerBaglami = {
    kilitAcik: o.kilitAcik,
    hasJson: o.hasJson,
    uniteKlasorleri: o.uniteKlasorleri,
    gonder: (b, istek, geri) => {
      const is = yeniIs(o.islemId?.() ?? crypto.randomUUID(), b.id, istek);
      if (geri) geriler.set(is, geri);
      void kuyruk.ekle(is);
    },
    bekleyenEklemeler: b => kuyruk.bekleyenler.filter(i => i.kitapId === b.id && eklemeMi(i)).map(i => i.istek),
    durum: () => durum,
    dinle: fn => { dinleyiciler.add(fn); return () => { dinleyiciler.delete(fn); }; },
    tekrarDene: () => { iz('tekrar dene'); void kuyruk.tekrarDene(); },
    vazgec: () => { void vazgec(); },
    girisYap: o.girisYap
  };
  // one event per line (the ?olcum=1 box cuts long lines)
  const izMetni = () => `dinleyici ${dinleyiciler.size} · bekleyen ${kuyruk.bekleyenler.length}` + olaylar.map(x => '\n  ' + x).join('');
  sonIz = izMetni;
  return { baglam, kuyruk, vazgec, iz: izMetni };
}
