import { geriAlIsi, type CopIsi } from '../drive/icindekilerCop';
import { copIsi, eklemeMi, IcindekilerKuyrugu, yeniIs, type IcindekilerDrive, type IcindekilerIsi, type IcindekilerSecenek, type KayitDurumu } from '../drive/icindekilerYaz';
import { gidenKonular, kitabaGeriKoy, kitaptanCikar, komsuKonu, type CopHedefi } from '../kitap/copeAt';
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
// - Task 6.K5b: a topic / unit to the trash (and "Geri al") runs in the same queue. The book in memory changes only
//   when Drive took it (folder and kitap.json); before that, the reader is told where to go when its open topic
//   goes (yonlendir). "Vazgeç" on a failed trash = "Geri al" of what was done. The dialog follows its operation by
//   copCalistir / copGeriAl (a promise per try; "Tekrar dene" goes on with the same operation).

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
  copIste?: (b: Book, hedef: CopHedefi | { tur: 'kitap' }) => void;   // 6.K5b: opens the dialog (main.ts)
}

export interface IcindekilerBaglantisi {
  baglam: IcindekilerBaglami;
  kuyruk: IcindekilerKuyrugu;
  vazgec(): Promise<void>;                  // as baglam.vazgec; resolves when the screen is back to Drive
  iz(): string;
  copCalistir(kitapId: string, c: CopIsi): Promise<void>;   // 6.K5b: the first try / "Tekrar dene"
  copGeriAl(kitapId: string, c: CopIsi): Promise<void>;     // 6.K5b: "Geri al" (also Vazgeç after a failed try)
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
  // 6.K5b: a topic folder that went → the topic to show instead (null: none left)
  const yonlendirme = new Map<string, string | null>();
  const copIsleri = new Map<CopIsi, IcindekilerIsi>();
  const copBellek = (b: Book, c: CopIsi) => {
    try {
      if (!c.geriAl) {
        const giden = new Set(gidenKonular(b.uniteler, c.hedef));
        for (const k of giden) yonlendirme.set(k, komsuKonu(b.uniteler, k, giden));
        c.bellek = kitaptanCikar(b, c.hedef);
      } else if (c.bellek) {
        kitabaGeriKoy(b, c.bellek);
        c.bellek = null;
        for (const k of gidenKonular(b.uniteler, c.hedef)) yonlendirme.delete(k);
      }
    } catch (e) { console.warn('İçindekiler: bellekteki kitap güncellenemedi.', e); }
  };

  const kuyruk = new IcindekilerKuyrugu({
    drive: o.drive,
    secenek: o.secenek,
    durum: d => { iz('durum ' + d.tur); durum = d; haber(); },
    basarili: (is, islem) => {
      const c = copIsi(is);
      iz('basarılı ' + (c ? (c.geriAl ? 'geri al' : 'çöp') : is.istek.tur));
      geriler.delete(is);
      // adding / trash: the book in memory changes only now (names and order changed at once)
      const b = o.kitap(is.kitapId);
      if (b && c) copBellek(b, c);
      else if (b && eklemeMi(is) && islem) uygula(b, islem);
      yenile();
      haber();
    }
  });

  async function vazgec(): Promise<void> {
    const is = kuyruk.vazgec();
    iz('vazgeç' + (is ? ' ' + is.istek.tur : ' (iş yok)'));
    if (!is) return;
    const c = copIsi(is);
    if (c) {
      // a failed trash: what was done goes back (the same listener hears it); a failed "Geri al": dropped
      if (!c.geriAl) {
        copIsleri.delete(c);
        geriAlIsi(c);
        const yeni = yeniIs(o.islemId?.() ?? crypto.randomUUID(), is.kitapId, { tur: 'cop', cop: c });
        yeni.bitti = is.bitti;
        copIsleri.set(c, yeni);
        void kuyruk.ekle(yeni);
      }
      haber();
      return;
    }
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

  // 6.K5b: one try of a trash / "Geri al" operation; a failed one in the queue is tried again (where it stopped)
  function copCalistir(kitapId: string, c: CopIsi): Promise<void> {
    return new Promise((res, rej) => {
      const bitti = (e: unknown) => { if (e) rej(e); else res(); };
      const is = copIsleri.get(c);
      if (is && kuyruk.bekleyenler.includes(is)) { is.bitti = bitti; iz('tekrar dene (çöp)'); void kuyruk.tekrarDene(); return; }
      const yeni = yeniIs(o.islemId?.() ?? crypto.randomUUID(), kitapId, { tur: 'cop', cop: c });
      yeni.bitti = bitti;
      copIsleri.set(c, yeni);
      void kuyruk.ekle(yeni);
    });
  }

  function copGeriAl(kitapId: string, c: CopIsi): Promise<void> {
    if (!c.geriAl) {
      const eski = copIsleri.get(c);
      // the failed trash still waits in the queue: it goes (it is the failed one: Vazgeç takes it out)
      if (eski && kuyruk.bekleyenler.includes(eski)) {
        eski.bitti = undefined;
        if (kuyruk.hataVar && kuyruk.bekleyenler[0] === eski) kuyruk.vazgec();
      }
      copIsleri.delete(c);
      geriAlIsi(c);
    }
    return copCalistir(kitapId, c);
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
    girisYap: o.girisYap,
    copIste: (b, hedef) => o.copIste?.(b, hedef),
    copBekleyenler: b => kuyruk.bekleyenler.filter(i => i.kitapId === b.id && copIsi(i) && !copIsi(i)!.geriAl).map(i => copIsi(i)!.hedef),
    yonlendir: k => yonlendirme.has(k) ? yonlendirme.get(k)! : undefined
  };
  // one event per line (the ?olcum=1 box cuts long lines)
  const izMetni = () => `dinleyici ${dinleyiciler.size} · bekleyen ${kuyruk.bekleyenler.length}` + olaylar.map(x => '\n  ' + x).join('');
  sonIz = izMetni;
  return { baglam, kuyruk, vazgec, iz: izMetni, copCalistir, copGeriAl };
}
