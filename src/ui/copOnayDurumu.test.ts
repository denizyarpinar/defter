import { describe, expect, it } from 'vitest';
import { CopIzinYok } from '../drive/copeAt';
import { GeriAlAdDolu } from '../drive/dosyaCop';
import { adSorulur, BASLIKLAR, copAcik, ENGEL_FOTO, hataAdimi, hataDugmeleri, kapatilabilir, ozetMetni, sayildi, uyariMetni } from './copOnayDurumu';

// Task 6.K5b: the trash dialog's steps (pure).

describe('copOnayDurumu', () => {
  const ozet = { konu: 2, dosya: 7, bekleyen: 0 };
  it('counted: changes on the device → the warning first, else straight to the confirm step', () => {
    expect(sayildi(ozet)).toEqual({ tur: 'onay', ozet });
    expect(sayildi({ ...ozet, bekleyen: 3 })).toEqual({ tur: 'uyari', ozet: { ...ozet, bekleyen: 3 } });
    expect(uyariMetni(3)).toMatch(/^Kaydedilmemiş 3 değişiklik var/);
    expect(uyariMetni(3)).toMatch(/silinmez/);
  });

  it('the text says what goes', () => {
    expect(ozetMetni('unite', ozet)).toBe('2 konu, 7 dosya çöpe gidecek. Drive\'ın çöpünden 30 gün içinde geri alınabilir.');
    expect(ozetMetni('yarim', { konu: 0, dosya: 0, bekleyen: 0 })).toMatch(/^Yarım klasör ve içindeki 0 dosya çöpe gidecek/);
  });

  it('the red button: only in the confirm step; a book only with its name typed (İ/ı as I/i, spaces around)', () => {
    const onay = sayildi(ozet);
    expect(copAcik(onay, adSorulur('konu'), '', 'Aussagen')).toBe(true);
    expect(adSorulur('kitap')).toBe(true);
    expect(copAcik(onay, true, '', 'İstatistik')).toBe(false);
    expect(copAcik(onay, true, 'istatistik ', 'İstatistik')).toBe(true);
    expect(copAcik(onay, true, 'ISTATISTIK', 'İstatistik')).toBe(true);
    expect(copAcik(onay, true, 'Istatistik 2', 'İstatistik')).toBe(false);
    expect(copAcik({ tur: 'sayiliyor' }, false, '', 'x')).toBe(false);
    expect(copAcik(sayildi({ ...ozet, bekleyen: 1 }), false, '', 'x')).toBe(false);
  });

  it('an error: Tekrar dene (Tekrar giriş yap without permission); Vazgeç after a failed trash, Kapat otherwise', () => {
    const izin = hataAdimi(new CopIzinYok(), 'cop');
    expect(izin).toMatchObject({ tur: 'hata', izin: true });
    expect(hataDugmeleri(izin as Extract<typeof izin, { tur: 'hata' }>)).toEqual({ ana: 'giris', yan: 'vazgec' });
    const ag = hataAdimi(new TypeError('Failed to fetch'), 'geri');
    expect(ag).toMatchObject({ mesaj: expect.stringMatching(/bağlanılamadı/) });
    expect(hataDugmeleri(ag as Extract<typeof ag, { tur: 'hata' }>)).toEqual({ ana: 'tekrar', yan: 'kapat' });
    expect(kapatilabilir({ tur: 'calisiyor', geri: false })).toBe(false);
    expect(kapatilabilir(ag)).toBe(true);
  });

  it('task 6.K6b, a file: the text, a summary with photos waiting → only a note, pen records → the warning', () => {
    expect(BASLIKLAR.dosya).toBe('Dosyayı çöpe at');
    expect(ozetMetni('dosya', { konu: 0, dosya: 1, bekleyen: 0 })).toBe("Dosya çöpe gidecek. Drive'ın çöpünden 30 gün içinde geri alınabilir.");
    expect(ozetMetni('dosya', { konu: 0, dosya: 2, bekleyen: 0 })).toMatch(/^Dosya ve çözümü çöpe gidecek/);
    const engel = sayildi({ konu: 0, dosya: 1, bekleyen: 2, engel: ENGEL_FOTO });
    expect(engel).toEqual({ tur: 'engel', metin: ENGEL_FOTO });
    expect(ENGEL_FOTO).toMatch(/Önce bekleyen fotoğrafları ekle/);
    expect(copAcik(engel, false, '', 'x')).toBe(false);
    expect(kapatilabilir(engel)).toBe(true);
    expect(sayildi({ konu: 0, dosya: 1, bekleyen: 1 }).tur).toBe('uyari');
  });

  it('task 6.K6b: Geri al with a new file of the same name: only Kapat (Tekrar dene no help)', () => {
    const a = hataAdimi(new GeriAlAdDolu(), 'geri');
    expect(a).toMatchObject({ tur: 'hata', mesaj: 'Aynı adlı yeni bir dosya var; eski dosya Drive çöpünde kaldı.', tekrarYok: true });
    expect(hataDugmeleri(a as Extract<typeof a, { tur: 'hata' }>)).toEqual({ ana: null, yan: 'kapat' });
  });
});
