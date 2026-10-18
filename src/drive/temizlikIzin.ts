import type { Book } from '../model/types';

// Task 6.3-0b: the one-time test cleanup (Deniz's decision, 18 Oct 2026, Claude outputs\temizlik-listesi.md).
// Pure: the fixed allow list and the checks. temizlikUygula.ts writes ONLY to the ids here:
//   - 'cop': trashed (files.update trashed=true; never files.delete)
//   - 'klasorle': inside a 'cop' folder; never trashed on its own, it goes with the folder (only checked)
// Every item is read again before anything happens: name, parent and trashed=false must still match.

export type Islem = 'cop' | 'klasorle';

export interface IzinOgesi {
  id: string;
  ad: string;
  ebeveyn: string;   // the parent folder's id
  tur: 'dosya' | 'klasor';
  islem: Islem;
}

export const FOLDER_MIME = 'application/vnd.google-apps.folder';

const DRIVE_KOKU = '0APV2cDqg0GqTUk9PVA';
const CEVIRI = '1QPTtgpjRpUbK43euaaoPK0CdEan0mxqh';            // (Drive kökü)/Defter-ceviri-deneme
const KITAP_KOKU = '1XlPhjeAIstVQ08ITEzJH3XoGx9R-xcpV';        // Kitaplık/kitaplar/programmiergrundlagen
const UNITE_01 = '1ZAYAFYh801GJrkZ3DPVUbzL56hS3Uu4R';          // …/Unite-01-Logik
const KONU_99 = '1GOJWYdRhqquNl9ehtk6jSqbhgOkHdP1r';           // …/Unite-01-Logik/Konu-99-Test-5.7
const OEDEVLER = '1G2lcFaFkGmMvNLFEjgvp7hTjTRRU7V8G';          // …/Konu-01-Aussagenlogik/Oedevler
const UEBUNGEN = '1iqvmiyCC2U-NZYRUECdLTU09mcHeNFQJ';          // …/Konu-01-Aussagenlogik/Uebungen

const d = (id: string, ad: string, ebeveyn: string, islem: Islem = 'cop'): IzinOgesi => ({ id, ad, ebeveyn, tur: 'dosya', islem });
const k = (id: string, ad: string, ebeveyn: string): IzinOgesi => ({ id, ad, ebeveyn, tur: 'klasor', islem: 'cop' });

export const IZIN_LISTESI: readonly IzinOgesi[] = [
  k(CEVIRI, 'Defter-ceviri-deneme', DRIVE_KOKU),
  d('1bk3NL1iMCgWCmV5oQ8XPpcGImFeGFVu23e_nxG7q1uQ', 'buyuk-sunum (5.11 deneme 17.10.2026 14:18:17)', CEVIRI, 'klasorle'),
  d('1VhhceJY6Qxjl4gbW4TRavb3hEKV0-MZCvDsSSK3N2cI', 'ders-notu (5.11 deneme 17.10.2026 14:15:15)', CEVIRI, 'klasorle'),
  d('16k7yk3OnPyLwBefI5dY3fO7OjqnszCxzmgFa3k3TL78', 'ders-sunumu (5.11 deneme 17.10.2026 14:16:33)', CEVIRI, 'klasorle'),
  d('1-XabPvDZKnoFHj5rBsoyvdlO0xhkSqSMPVOuR0w1qsc', 'zengin-odev (5.11 deneme 17.10.2026 14:17:34)', CEVIRI, 'klasorle'),
  d('1wwxe0XABj833onJBQmyI2KU7Bm4b5_eB', 'deneme-5.5.pdf', KITAP_KOKU),
  d('17tL0qeHuDzhS4SctULpmue_71waeXxq9', 'ders-sunumu.pdf', OEDEVLER),
  d('1tb95ws8C2n1H349ewJzTsMe9ibhisl4s', 'derso-sunumu.pdf', OEDEVLER),
  d('1WJNZgLPN8yZEGwz90g5GIPkyMR1ZhS0A', 'tahta.pdf', OEDEVLER),
  d('1sb6MyAG1QhWPYjVtTO2Eu-7U5AsUjrYW', 'tutorial01-installation-guide.pdf', OEDEVLER),
  d('1OSjMIRa-HzwA7AsslzRlatwjYOhYZajF', 'A-test_cozum.pdf', UEBUNGEN),
  d('1Emg0k5o13AasfUFWvWlv1wkhQ_wcRmxI', 'A-test.pdf', UEBUNGEN),
  d('19AA5HX_XvP-DWcSeH48S_ddhQFOCOu0z', 'B-test.pdf', UEBUNGEN),
  d('1gTMeEa_Ha4sfCzrl5s0-cCIu0u7TIA8k', 'coklu–pdf.pdf', UEBUNGEN),
  d('1Gb7PYO8znkglimwEM-CZDg3FRD7BdbMX', 'defter.pdf', UEBUNGEN),
  d('1irQCkdCseFfqwMJECUWjE9Yol5PscMMW', 'ders-notu.pdf', UEBUNGEN),
  d('1Du5fzlx7d7jpFkPxzw6M9FczUwG8uBU5', 'DFKI_Access_Rules.pdf', UEBUNGEN),
  d('1mjb_XNhLb3F5hZRsDIBkO_nR8SSHAPGl', 'DFKI_Accessee_Rules.pdf', UEBUNGEN),
  d('1HJv3zLEWDvnpoq2RGxraJyuCDCVacvrB', 'DFKI_Accessf_Rules.pdf', UEBUNGEN),
  d('1qug8_P0XAa4hbopjYoF4FZCmzIb0hWAU', 'IMG_0115.pdf', UEBUNGEN),
  d('1Tqb7wM1pDZ7fWHq9HML4DX0In_razLBt', 'IMG_0116.pdfdft.pdf', UEBUNGEN),
  d('106brd3ZhIJWIngIWlE8Dd8Mse2a-9ZOJ', 'IMG_1353.pdf', UEBUNGEN),
  d('19PjVAZdUtLybRs8k_drlGnmUryXlP-u7', 'IMGed_0116.pdf', UEBUNGEN),
  d('1tTMnlVnlzLXbEi5p-Oc0PuQVD6nSk3LL', 'ipad-not.pdf', UEBUNGEN),
  d('1JNavNAhTJbvCKWFGPj8zJTc0WrAZz4m0', 'kilitsiz.pdf', UEBUNGEN),
  d('1Oz7JHm-iOzuKSSIO74D1YtkyGiN5oQTA', 'klavye–test.pdf', UEBUNGEN),
  d('1ecBf1UosasNMRiahagbIaHFjZ5oiwSiY', 'kucuk.pdf', UEBUNGEN),
  d('1OQpA7IoiWcnr7-JDb3YBoCODPNuVDXzX', 'kucuk2_cozum.pdf', UEBUNGEN),
  d('1zUTFkf_GYpA2lcN8OCsdwnsN-M5ugXXb', 'kucuk2.pdf', UEBUNGEN),
  d('1vGTb-0QyTNmJElagyhwxA6V0SptSkvPv', 'Robotics-test2_cozum.pdf', UEBUNGEN),
  d('1_d8M3koCowwJRnOYD2t2Q_5V-awdg5cK', 'Robotics-test2.pdf', UEBUNGEN),
  d('1WHZMJQYQQtQ4sd8TSm6-CL5TJJdG571q', 'tahta.pdf', UEBUNGEN),
  d('1pwXVLSx78bw0CfGJaOuW7mVrVx4eCmwg', 'tutorial01-installation-guide.pdf', UEBUNGEN),
  k(KONU_99, 'Konu-99-Test-5.7', UNITE_01),
  d('1RVYQrYARDyW8lLnaEUBKuRih0dRVUxwv', 'ozet.pdf', KONU_99, 'klasorle'),
];

// Konu-01's ozet.pdf goes back to its kept revision (27 pages, 15 Oct); pages 67–68 are saved locally first
export const OZET = {
  id: '1D79OJt9Z1DVB9V1WxgA82eClZGmsndmd',
  ad: 'ozet.pdf',
  ebeveyn: '1fi_3ITEm3SvgPgY_cdhzoJmiLVdSysxu',   // …/Unite-01-Logik/Konu-01-Aussagenlogik
  rev: '0B_V2cDqg0GqTTFhNWXJqTVBPOVA4V1Y5UmRMa2tXNzh4ZThvPQ',
  head: '0B_V2cDqg0GqTQ2sxOTZ2T2FzeGNMV0xrM2VHQjB3MWJJZGRNPQ',   // the version the list was made from
  sayfa: 27,
  yedekSayfalar: [67, 68],
  yedekEkId: '359de748-7e82-444d-89aa-3bd3f03d69d1',
  yedekAd: 'ozet-s67-68-yedek.pdf',
} as const;

export interface Meta { id?: string; name?: string; parents?: string[]; trashed?: boolean; mimeType?: string }

export type Eslesme = { tamam: true } | { tamam: false; neden: string };

// Is the file in Drive still the one on the list? (name, parent, not in the trash, file or folder)
export function eslesme(o: Pick<IzinOgesi, 'id' | 'ad' | 'ebeveyn' | 'tur'>, m: Meta): Eslesme {
  if (m.id !== o.id) return { tamam: false, neden: `id farklı (${m.id ?? '—'})` };
  if (m.name !== o.ad) return { tamam: false, neden: `ad farklı: "${m.name ?? '—'}" (beklenen "${o.ad}")` };
  if (!m.parents?.includes(o.ebeveyn)) return { tamam: false, neden: `üst klasör farklı: ${m.parents?.join(', ') || '—'} (beklenen ${o.ebeveyn})` };
  if (m.trashed !== false) return { tamam: false, neden: m.trashed ? 'zaten çöpte' : 'trashed bilinmiyor' };
  if ((m.mimeType === FOLDER_MIME) !== (o.tur === 'klasor')) return { tamam: false, neden: `tür farklı (${m.mimeType ?? '—'})` };
  return { tamam: true };
}

// A folder goes to the trash only if everything in it is on the list as 'klasorle' (no unknown file goes with it)
export function klasorIciTamam(klasorId: string, cocuklar: readonly { id: string; name: string }[]): Eslesme {
  const izinli = new Set(IZIN_LISTESI.filter(o => o.islem === 'klasorle' && o.ebeveyn === klasorId).map(o => o.id));
  const yabanci = cocuklar.filter(c => !izinli.has(c.id));
  return yabanci.length
    ? { tamam: false, neden: `klasörde listede olmayan ${yabanci.length} öğe var: ${yabanci.map(c => c.name).join(', ')}` }
    : { tamam: true };
}

export const copIzni = (id: string) => IZIN_LISTESI.some(o => o.id === id && o.islem === 'cop');

// The lock: ?temizlik=1
export const kilitAcik = (search: string) => new URLSearchParams(search).get('temizlik') === '1';

// Topics of the book whose folder is Konu-99-Test-5.7 (kitap.json is only read)
export function konu99Kayitlari(book: Book | undefined): string[] {
  if (!book) return [];
  return book.uniteler.flatMap(u => u.konular
    .filter(t => /(?:^|\/)Konu-99-Test-5\.7(?:\/|$)/i.test(t.klasor))
    .map(t => `${u.baslik} / ${t.baslik} (${t.klasor})`));
}
