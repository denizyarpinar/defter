import { describe, expect, it } from 'vitest';
import { SharedBookForm, quickBookEnabled, newBookShortcut, PendingBookOpening } from './hizliKitap';
import { parseBook } from '../model/parse';

describe('A2 ortak kitap formu', () => {
  it('hızlı başlangıçta kitap adı ve ilk konu gereklidir', () => {
    const f = new SharedBookForm('r1', '#24476b');
    expect(f.state([], 'acik').olusturAcik).toBe(false);
    f.name = 'Mathe';
    expect(f.state([], 'acik').olusturAcik).toBe(false);
    f.setFirstTopic('Logik');
    expect(f.state([], 'acik').olusturAcik).toBe(true);
  });
  it('özel işaretli ilk konu tek konudur; görünen ad planla eşleşir', () => {
    const f = new SharedBookForm('r1', '#24476b'); f.name = 'Mathe';
    f.setFirstTopic('# 1. Konu');
    expect(f.units).toEqual([{ ad: 'Genel', konular: ['# 1. Konu'] }]);
    expect((f.state([], 'acik').plan.kitapJson.uniteler as any)[0].konular[0].baslik).toBe('# 1. Konu');
  });
  it('ayrıntılar açılıp kapanınca ilk konu, raf, renk ve ham liste korunur', () => {
    const f = new SharedBookForm('r1', '#24476b'); f.name = 'Mathe'; f.setFirstTopic('Logik');
    const initial = f.text; f.toggleDetails(); expect(f.text).toBe(initial);
    f.text = '# A\n- Bir\n- İki\n\n# B\n- Üç'; f.shelfId = 'r2'; f.color = '#2f5d50';
    const before = f.state([], 'acik').plan;
    f.toggleDetails(); f.toggleDetails(); f.toggleDetails();
    expect(f.text).toBe('# A\n- Bir\n- İki\n\n# B\n- Üç');
    expect(f.state([], 'acik').plan).toEqual(before);
    expect(f.simple).toBe(false);
    expect(f.units.map(u => u.konular)).toEqual([['Bir', 'İki'], ['Üç']]);
  });
  it('konusuz ayrıntılı ünite bölüm kapatılınca da oluşturulur; boş liste oluşturulmaz', () => {
    const f = new SharedBookForm('r1', '#24476b'); f.name = 'Mathe'; f.toggleDetails(); f.text = '# A';
    f.toggleDetails(); expect(f.state([], 'acik').olusturAcik).toBe(true);
    expect(f.units).toEqual([{ ad: 'A', konular: [] }]);
    f.text = ''; expect(f.state([], 'acik').olusturAcik).toBe(false);
  });
  it('ilk konu değişimi çoklu yapıyı silemez; kapalı ayrıntıdaki plan aynı kalır', () => {
    const f = new SharedBookForm('r1', '#24476b'); f.text = '# A\nBir\nİki';
    const text = f.text; f.setFirstTopic('Yeni'); expect(f.text).toBe(text);
  });
});

describe('A2 geri alma ve kısayol', () => {
  it('varsayılan açık; yalnız hizliKitap=0 kapatır', () => {
    expect(quickBookEnabled('')).toBe(true); expect(quickBookEnabled('?hizliKitap=0')).toBe(false);
  });
  it('dolu ve örnekli Drive kitaplığında görünür; boş büyük düğme ile çift olmaz', () => {
    expect(newBookShortcut(true, true, 1, false)).toBe(true);
    expect(newBookShortcut(true, true, 0, true)).toBe(false);
    expect(newBookShortcut(true, true, 0, false)).toBe(true);
  });
  it('demo, girişsiz, kilitli ve geri alınmış durumda görünmez', () => {
    expect(newBookShortcut(false, true, 1, false)).toBe(false);
    expect(newBookShortcut(true, false, 1, false)).toBe(false);
    expect(newBookShortcut(true, true, 1, false, false)).toBe(false);
  });
});

describe('A2 kimlikle otomatik geçiş', () => {
  const book = () => parseBook('mathe', { surum: 2, baslik: 'Mathe', uniteler: [{ baslik: 'Genel', konular: [{ baslik: 'A', klasor: 'u/k' }] }] });
  it('yalnız beklenen kitap ve konu bir kez alınır', () => {
    const b = book(), p = new PendingBookOpening(); p.set(b, 'u/k');
    expect(p.take('other', b)).toBeNull();
    expect(p.take('mathe', b)).toEqual({ unit: 0, topic: 0 });
    expect(p.take('mathe', b)).toBeNull();
  });
  it('iptal veya yenilenmiş kitap nesnesi geçişi engeller', () => {
    const b = book(), p = new PendingBookOpening(); p.set(b, 'u/k'); p.clear();
    expect(p.take('mathe', b)).toBeNull(); p.set(b, 'u/k');
    expect(p.take('mathe', book())).toBeNull();
  });
  it('silinmiş konu ve konusuz kitap için geçiş yoktur', () => {
    const b = book(), p = new PendingBookOpening(); p.set(b, 'missing');
    expect(p.take('mathe', b)).toBeNull();
  });
});
