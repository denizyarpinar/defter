// Task 6.K4a: Drive folder names for a new book, as the existing books have them (programlamaya-giris, Mathe 1):
// Unite-01-Temeller / Konu-03-Metotlar — the unit number counts units, the topic number counts on through the whole
// book (Unite-02 starts with Konu-03). The shown names stay as typed in kitap.json; only the folder names are ASCII.
// Pure, tested.

// Letters NFD does not take apart (or that turn into two letters); the rest lose their marks (é → e)
const OZEL: Record<string, string> = {
  'ä': 'ae', 'ö': 'oe', 'ü': 'ue', 'Ä': 'Ae', 'Ö': 'Oe', 'Ü': 'Ue', 'ß': 'ss', 'ẞ': 'SS',   // dil-kontrol: yoksay
  'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ş': 's', 'Ş': 'S', 'ç': 'c', 'Ç': 'C',   // dil-kontrol: yoksay
  'æ': 'ae', 'Æ': 'Ae', 'ø': 'o', 'Ø': 'O', 'œ': 'oe', 'Œ': 'Oe', 'ł': 'l', 'Ł': 'L'
};

export const ASCII_EN_COK = 40;   // the name part of a folder name, at most

// "Werte, Typen & Ausdrücke" → "Werte-Typen-Ausdruecke" (case kept; other signs → "-", one at a time, none at the ends)
export function asciiAd(ad: string, enCok = ASCII_EN_COK): string {
  const harfler = [...ad].map(c => OZEL[c] ?? c).join('')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  const s = harfler.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return s.slice(0, enCok).replace(/-+$/, '');
}

const iki = (n: number) => String(n).padStart(2, '0');

// klasorAdi('unite', 1, 'Logik') → "Unite-01-Logik"; a name with no ASCII letter left → "Unite-01"
export function klasorAdi(tur: 'unite' | 'konu', sira: number, ad: string): string {
  const on = `${tur === 'unite' ? 'Unite' : 'Konu'}-${iki(sira)}`;
  const a = asciiAd(ad);
  return a ? `${on}-${a}` : on;
}

// The book's folder = its id (CLAUDE.md: lower case, dashes): "Mathe 1" → "mathe-1"
export function kitapKlasorAdi(kitapAdi: string): string {
  return asciiAd(kitapAdi).toLowerCase() || 'kitap';
}
