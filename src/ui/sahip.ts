import { dil, t } from '../dil';

// The book's title page: whose library it comes from. Pure (only the chosen language), tested.

// The owner's first name, possessive: Deniz'in, Ayşe'nin, Umut'un, Gül'ün (tr); Deniz's, James' (en).
export function genitive(name: string): string {
  const first = name.trim().split(/\s+/)[0] || name;
  if (dil() === 'en') return /s$/i.test(first) ? `${first}'` : `${first}'s`;
  const lower = first.toLocaleLowerCase('tr-TR');
  const vowels = [...lower].filter(c => 'aeıioöuü'.includes(c));
  const last = vowels.at(-1) ?? 'e';
  const v = 'aı'.includes(last) ? 'ı' : 'ei'.includes(last) ? 'i' : 'ou'.includes(last) ? 'u' : 'ü';
  return `${first}'${'aeıioöuü'.includes(lower.at(-1)!) ? 'n' : ''}${v}n`;
}

// "Deniz'in kitaplığından" / "From Deniz's library"; null owner = the sample library
export const kitapligindan = (owner: string | null): string =>
  owner ? t('masa.kitapligindan', { sahip: genitive(owner) }) : t('masa.ornekten');
