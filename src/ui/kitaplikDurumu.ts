// Task 5.1: which library is on screen, and what the user can do with it. Pure (no DOM), tested.
// - The sample library is shown only when the visitor chooses it (card, error cards) or with ?demo.
// - While the sign-in card is open, while signing in and while the Drive library loads:
//   empty, faded shelves; books can't be opened or moved (locked).
// - Errors never leave the user on the faded screen: the error / "not found" card has
//   "Tekrar dene" and "Örnek kitaplıkla dene".
// - Only the Drive library writes to Drive (etkinYazici).

export type KitaplikDurumu =
  | { tur: 'girisYok'; hata?: string }         // sign-in card
  | { tur: 'giriliyor' }                       // Google popup open, card shows "Bağlanıyor…"
  | { tur: 'yukleniyor' }                      // reading the Drive library
  | { tur: 'drive'; oturumDoldu?: boolean; mesgul?: boolean; hata?: string }   // session expired: card over the Drive library
  | { tur: 'demo' }
  | { tur: 'hata'; mesaj: string }
  | { tur: 'bulunamadi' };

export type KitaplikOlayi =
  | { tur: 'girisBasladi' }
  | { tur: 'girisBasarili' }
  | { tur: 'girisHata'; mesaj: string }
  | { tur: 'driveGeldi' }
  | { tur: 'driveHata'; mesaj: string }
  | { tur: 'bulunamadi' }
  | { tur: 'tekrarDene' }
  | { tur: 'demoSecildi' }
  | { tur: 'demoHata'; mesaj: string }
  | { tur: 'cikis' }
  | { tur: 'oturumDoldu'; mesaj: string };

export interface KitaplikGorunumu {
  kitaplik: 'bos' | 'demo' | 'drive';
  kilitli: boolean;        // books can't be opened or dragged; the shelves are faded
  yukleniyor: boolean;     // "Kitaplığın yükleniyor…"
  kart: 'giris' | 'hata' | 'bulunamadi' | null;
  girisMesgul: boolean;    // sign-in button shows "Bağlanıyor…"
  girisHata: string | null;
  hataMesaji: string | null;
  yazilabilir: boolean;    // changes may be written to Drive
}

export const ilkDurum = (demo: boolean): KitaplikDurumu => demo ? { tur: 'demo' } : { tur: 'girisYok' };

// An event that doesn't fit the state (e.g. a late answer) leaves it as it is.
export function gecis(d: KitaplikDurumu, o: KitaplikOlayi): KitaplikDurumu {
  switch (o.tur) {
    case 'girisBasladi':
      if (d.tur === 'drive') return d.oturumDoldu ? { tur: 'drive', oturumDoldu: true, mesgul: true } : d;
      return { tur: 'giriliyor' };
    case 'girisBasarili':
      if (d.tur === 'giriliyor') return { tur: 'yukleniyor' };
      if (d.tur === 'drive') return { tur: 'drive' };   // signed in again: the Drive library is already here
      return d;
    case 'girisHata':
      if (d.tur === 'giriliyor' || d.tur === 'girisYok') return { tur: 'girisYok', hata: o.mesaj };
      if (d.tur === 'drive' && d.oturumDoldu) return { tur: 'drive', oturumDoldu: true, hata: o.mesaj };
      return d;
    case 'driveGeldi':
      return d.tur === 'yukleniyor' ? { tur: 'drive' } : d;
    case 'driveHata':
      return d.tur === 'yukleniyor' ? { tur: 'hata', mesaj: o.mesaj } : d;
    case 'bulunamadi':
      return d.tur === 'yukleniyor' ? { tur: 'bulunamadi' } : d;
    case 'tekrarDene':
      return d.tur === 'hata' || d.tur === 'bulunamadi' ? { tur: 'yukleniyor' } : d;
    case 'demoSecildi':
      return d.tur === 'drive' ? d : { tur: 'demo' };
    case 'demoHata':
      return d.tur === 'demo' ? { tur: 'girisYok', hata: o.mesaj } : d;
    case 'cikis':
      return { tur: 'girisYok' };
    case 'oturumDoldu':
      if (d.tur === 'drive') return { tur: 'drive', oturumDoldu: true, hata: o.mesaj };
      if (d.tur === 'demo') return d;
      return { tur: 'girisYok', hata: o.mesaj };
  }
}

export function gorunum(d: KitaplikDurumu): KitaplikGorunumu {
  const drive = d.tur === 'drive';
  return {
    kitaplik: drive ? 'drive' : d.tur === 'demo' ? 'demo' : 'bos',
    kilitli: !drive && d.tur !== 'demo',
    yukleniyor: d.tur === 'yukleniyor',
    kart: d.tur === 'girisYok' || d.tur === 'giriliyor' || (drive && d.oturumDoldu) ? 'giris'
      : d.tur === 'hata' ? 'hata'
      : d.tur === 'bulunamadi' ? 'bulunamadi'
      : null,
    girisMesgul: d.tur === 'giriliyor' || (drive && d.mesgul === true),
    girisHata: (d.tur === 'girisYok' || drive) ? d.hata ?? null : null,
    hataMesaji: d.tur === 'hata' ? d.mesaj : null,
    yazilabilir: drive
  };
}

// The Drive writer, only while the Drive library is on screen. Empty / sample library: null.
export function etkinYazici<T>(d: KitaplikDurumu, yazici: T | null): T | null {
  return gorunum(d).yazilabilir ? yazici : null;
}
