import { describe, expect, it, vi } from 'vitest';
import { etkinYazici, gecis, gorunum, ilkDurum, type KitaplikDurumu, type KitaplikOlayi } from './kitaplikDurumu';

const run = (d: KitaplikDurumu, ...events: KitaplikOlayi[]) => events.reduce(gecis, d);

const ALL: KitaplikDurumu[] = [
  { tur: 'girisYok' }, { tur: 'girisYok', hata: 'x' }, { tur: 'giriliyor' }, { tur: 'yukleniyor' },
  { tur: 'drive' }, { tur: 'drive', oturumDoldu: true }, { tur: 'demo' }, { tur: 'hata', mesaj: 'x' },
  { tur: 'kurulum', dugme: 'kur', kilitli: true }, { tur: 'kurulum', dugme: 'kur', kilitli: false, mesgul: true },
  { tur: 'kurulum', dugme: 'tamamla', kilitli: false, hata: 'x', izinYok: true },
  { tur: 'tamErisim' }, { tur: 'tamErisim', mesgul: true }, { tur: 'tamErisim', hata: 'x' }
];
const NOT_DRIVE = ALL.filter(d => d.tur !== 'drive');

describe('library state: start', () => {
  it('without ?demo: sign-in card over empty, locked shelves; no sample books', () => {
    const v = gorunum(ilkDurum(false));
    expect(v).toMatchObject({ kitaplik: 'bos', kilitli: true, kart: 'giris', yukleniyor: false, yazilabilir: false });
  });

  it('?demo: the sample library, unlocked, no card', () => {
    expect(gorunum(ilkDurum(true))).toMatchObject({ kitaplik: 'demo', kilitli: false, kart: null, yazilabilir: false });
  });
});

describe('library state: sign-in and loading', () => {
  it('sign in → loading → Drive library', () => {
    let d = run(ilkDurum(false), { tur: 'girisBasladi' });
    expect(gorunum(d)).toMatchObject({ kitaplik: 'bos', kilitli: true, kart: 'giris', girisMesgul: true });
    d = gecis(d, { tur: 'girisBasarili' });
    expect(gorunum(d)).toMatchObject({ kitaplik: 'bos', kilitli: true, kart: null, yukleniyor: true });
    d = gecis(d, { tur: 'driveGeldi' });
    expect(gorunum(d)).toMatchObject({ kitaplik: 'drive', kilitli: false, kart: null, yukleniyor: false, yazilabilir: true });
  });

  it('from the sample library: signing in removes the sample books', () => {
    expect(gorunum(run(ilkDurum(true), { tur: 'girisBasladi' }))).toMatchObject({ kitaplik: 'bos', kilitli: true });
  });

  it('sign-in failed: the card again, with the message (Google + sample buttons)', () => {
    const d = run(ilkDurum(false), { tur: 'girisBasladi' }, { tur: 'girisHata', mesaj: 'Pencere kapandı.' });
    expect(gorunum(d)).toMatchObject({ kart: 'giris', girisMesgul: false, girisHata: 'Pencere kapandı.', kilitli: true });
  });

  it('a sign-in that finishes after the visitor chose the sample library changes nothing', () => {
    const d = run(ilkDurum(false), { tur: 'girisBasladi' }, { tur: 'demoSecildi' }, { tur: 'girisBasarili' });
    expect(d).toEqual({ tur: 'demo' });
  });
});

describe('library state: errors never leave the faded screen without a way out', () => {
  it('Drive error → error card → Tekrar dene → loading', () => {
    let d = run(ilkDurum(false), { tur: 'girisBasladi' }, { tur: 'girisBasarili' }, { tur: 'driveHata', mesaj: 'Bağlantı yok.' });
    expect(gorunum(d)).toMatchObject({ kart: 'hata', hataMesaji: 'Bağlantı yok.', kilitli: true, yukleniyor: false });
    d = gecis(d, { tur: 'tekrarDene' });
    expect(gorunum(d)).toMatchObject({ kart: null, yukleniyor: true, kilitli: true });
  });

  it('no root → "Kitaplığını kur" card → sample library possible', () => {
    const d = run(ilkDurum(false), { tur: 'girisBasladi' }, { tur: 'girisBasarili' }, { tur: 'kurulumGerekli', dugme: 'kur', kilitli: false });
    expect(gorunum(d).kart).toBe('kurulum');
    expect(gorunum(gecis(d, { tur: 'demoSecildi' }))).toMatchObject({ kitaplik: 'demo', kart: null, kilitli: false });
  });

  it('every locked state has a card or the loading sign', () => {
    for (const d of ALL) {
      const v = gorunum(d);
      if (v.kilitli) expect(v.kart !== null || v.yukleniyor).toBe(true);
    }
  });

  it('the sample library could not be loaded → the sign-in card with the message', () => {
    expect(gorunum(run(ilkDurum(false), { tur: 'demoSecildi' }, { tur: 'demoHata', mesaj: 'Yüklenemedi.' })))
      .toMatchObject({ kart: 'giris', girisHata: 'Yüklenemedi.' });
  });

  it('late answers from Drive are ignored after sign-out or choosing the sample library', () => {
    const loading = run(ilkDurum(false), { tur: 'girisBasladi' }, { tur: 'girisBasarili' });
    expect(run(loading, { tur: 'cikis' }, { tur: 'driveGeldi' })).toEqual({ tur: 'girisYok' });
    expect(run(loading, { tur: 'demoSecildi' }, { tur: 'driveHata', mesaj: 'x' })).toEqual({ tur: 'demo' });
  });
});

describe('library state: owner with drive.file only (task 6.K1)', () => {
  const signedIn = () => run(ilkDurum(false), { tur: 'girisBasladi' }, { tur: 'girisBasarili' });

  it('"Tam erişim gerekiyor" card instead of loading (not the "not found" card)', () => {
    const d = gecis(signedIn(), { tur: 'tamErisimGerekli' });
    expect(gorunum(d)).toMatchObject({ kart: 'tamErisim', kitaplik: 'bos', kilitli: true, yukleniyor: false, yazilabilir: false, tamErisimMesgul: false });
  });

  it('button → busy → full drive → loading → Drive library', () => {
    let d = run(signedIn(), { tur: 'tamErisimGerekli' }, { tur: 'tamErisimBasladi' });
    expect(gorunum(d)).toMatchObject({ kart: 'tamErisim', tamErisimMesgul: true });
    d = gecis(d, { tur: 'tamErisimVerildi' });
    expect(gorunum(d)).toMatchObject({ kart: null, yukleniyor: true });
    expect(gorunum(gecis(d, { tur: 'driveGeldi' }))).toMatchObject({ kitaplik: 'drive', yazilabilir: true });
  });

  it('permission not given: the card stays with the message; sample library still possible', () => {
    const d = run(signedIn(), { tur: 'tamErisimGerekli' }, { tur: 'tamErisimBasladi' }, { tur: 'tamErisimHata', mesaj: 'İzin verilmedi.' });
    expect(gorunum(d)).toMatchObject({ kart: 'tamErisim', tamErisimMesgul: false, tamErisimHata: 'İzin verilmedi.' });
    expect(gorunum(gecis(d, { tur: 'demoSecildi' }))).toMatchObject({ kitaplik: 'demo', kart: null });
  });

  it('only from loading; late events elsewhere change nothing', () => {
    expect(gecis({ tur: 'drive' }, { tur: 'tamErisimGerekli' })).toEqual({ tur: 'drive' });
    expect(gecis({ tur: 'demo' }, { tur: 'tamErisimVerildi' })).toEqual({ tur: 'demo' });
    expect(gecis({ tur: 'girisYok' }, { tur: 'tamErisimHata', mesaj: 'x' })).toEqual({ tur: 'girisYok' });
  });
});

describe('library state: "Kitaplığını kur" card (task 6.K2b)', () => {
  const loading = () => run(ilkDurum(false), { tur: 'girisBasladi' }, { tur: 'girisBasarili' });
  const kart = (kilitli = false) => gecis(loading(), { tur: 'kurulumGerekli', dugme: 'kur', kilitli });

  it('instead of loading: locked shelves, nothing written', () => {
    expect(gorunum(kart())).toMatchObject({
      kart: 'kurulum', kitaplik: 'bos', kilitli: true, yukleniyor: false, yazilabilir: false,
      kurulum: { dugme: 'kur', kilitli: false, mesgul: false, hata: null, izinYok: false }
    });
    expect(gorunum(gecis(loading(), { tur: 'kurulumGerekli', dugme: 'tamamla', kilitli: false })).kurulum?.dugme).toBe('tamamla');
  });

  it('button → busy (a second tap changes nothing) → done → loading → Drive library', () => {
    let d = gecis(kart(), { tur: 'kurulumBasladi' });
    expect(gorunum(d).kurulum).toMatchObject({ mesgul: true, hata: null });
    expect(gecis(d, { tur: 'kurulumBasladi' })).toEqual(d);
    d = gecis(d, { tur: 'kurulumBitti' });
    expect(gorunum(d)).toMatchObject({ kart: null, yukleniyor: true });
    expect(gorunum(gecis(d, { tur: 'driveGeldi' }))).toMatchObject({ kitaplik: 'drive', yazilabilir: true });
  });

  it('progress (6.K3): only while busy; a new try starts without it', () => {
    let d = gecis(kart(), { tur: 'kurulumBasladi' });
    expect(gorunum(d).kurulum?.ilerleme).toBeNull();
    d = gecis(d, { tur: 'kurulumIlerleme', i: 2, n: 18 });
    expect(gorunum(d).kurulum).toMatchObject({ mesgul: true, ilerleme: { i: 2, n: 18 } });
    expect(gecis(kart(), { tur: 'kurulumIlerleme', i: 2, n: 18 })).toEqual(kart());   // not busy: ignored
    d = run(d, { tur: 'kurulumHata', mesaj: 'x', izinYok: false }, { tur: 'kurulumBasladi' });
    expect(gorunum(d).kurulum?.ilerleme).toBeNull();
  });

  it('locked: the tap changes nothing', () => {
    expect(gecis(kart(true), { tur: 'kurulumBasladi' })).toEqual(kart(true));
  });

  it('error: the card stays with the message; no permission is flagged; retry → busy again', () => {
    const d = run(kart(), { tur: 'kurulumBasladi' }, { tur: 'kurulumHata', mesaj: 'Bağlantı yok.', izinYok: false });
    expect(gorunum(d).kurulum).toEqual({ dugme: 'kur', kilitli: false, mesgul: false, hata: 'Bağlantı yok.', izinYok: false, ilerleme: null });
    expect(gorunum(gecis(d, { tur: 'kurulumBasladi' })).kurulum).toMatchObject({ mesgul: true, hata: null });
    const izin = run(kart(), { tur: 'kurulumBasladi' }, { tur: 'kurulumHata', mesaj: 'İzin yok.', izinYok: true });
    expect(gorunum(izin).kurulum?.izinYok).toBe(true);
    // "Tekrar giriş yap" = the normal sign-in
    expect(gecis(izin, { tur: 'girisBasladi' })).toEqual({ tur: 'giriliyor' });
  });

  it('late events elsewhere change nothing', () => {
    expect(gecis({ tur: 'drive' }, { tur: 'kurulumGerekli', dugme: 'kur', kilitli: false })).toEqual({ tur: 'drive' });
    expect(gecis({ tur: 'demo' }, { tur: 'kurulumBitti' })).toEqual({ tur: 'demo' });
    expect(gecis(kart(), { tur: 'kurulumBitti' })).toEqual(kart());   // not busy: no set-up was running
    expect(gecis({ tur: 'girisYok' }, { tur: 'kurulumHata', mesaj: 'x', izinYok: false })).toEqual({ tur: 'girisYok' });
  });
});

describe('library state: session and sign-out', () => {
  it('session expired: the card over the Drive library (it stays), signing in again does not reload it', () => {
    let d = run({ tur: 'drive' }, { tur: 'oturumDoldu', mesaj: 'Oturum doldu.' });
    expect(gorunum(d)).toMatchObject({ kitaplik: 'drive', kart: 'giris', girisHata: 'Oturum doldu.' });
    d = gecis(d, { tur: 'girisBasladi' });
    expect(gorunum(d).girisMesgul).toBe(true);
    expect(gecis(d, { tur: 'girisBasarili' })).toEqual({ tur: 'drive' });
  });

  it('session expired while loading: the sign-in card', () => {
    const d = run({ tur: 'yukleniyor' }, { tur: 'oturumDoldu', mesaj: 'Oturum doldu.' }, { tur: 'driveHata', mesaj: 'x' });
    expect(gorunum(d)).toMatchObject({ kart: 'giris', girisHata: 'Oturum doldu.', kitaplik: 'bos' });
  });

  it('sign-out from anywhere: card over empty shelves', () => {
    for (const d of ALL) expect(gorunum(gecis(d, { tur: 'cikis' }))).toMatchObject({ kitaplik: 'bos', kart: 'giris', kilitli: true });
  });
});

describe('library state: only the Drive library writes to Drive', () => {
  const fakeSaver = () => ({ libraryChanged: vi.fn(), coverChanged: vi.fn() });

  it('empty, locked and sample libraries never call the writer (no kitaplik.json is created)', () => {
    for (const d of NOT_DRIVE) {
      const s = fakeSaver();
      expect(gorunum(d).yazilabilir).toBe(false);
      // what main.ts does on a shelf / room / mode / cover change
      etkinYazici(d, s)?.libraryChanged();
      etkinYazici(d, s)?.coverChanged('kitap');
      expect(s.libraryChanged).not.toHaveBeenCalled();
      expect(s.coverChanged).not.toHaveBeenCalled();
    }
  });

  it('the Drive library writes (also behind the session-expired card)', () => {
    for (const d of ALL.filter(x => x.tur === 'drive')) {
      const s = fakeSaver();
      etkinYazici(d, s)?.libraryChanged();
      expect(s.libraryChanged).toHaveBeenCalledOnce();
    }
  });
});
