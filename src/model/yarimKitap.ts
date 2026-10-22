// A book folder the app made (6.K3 sample: defterOrnek; 6.K4b wizard: defterIslem) without its kitap.json
// is half made: the library doesn't show it, so the wizard's Drive check (YarimKitapVar) can see it.
// Folders without these marks (the owner's Kitaplık, surum 1) keep the old rule: grey cover.

export type YarimNeden = 'ornek' | 'sihirbaz';

export function yarimKitapNedeni(appProperties: Record<string, string> | undefined, kitapJsonVar: boolean): YarimNeden | null {
  if (kitapJsonVar) return null;
  if (appProperties?.defterOrnek === '1') return 'ornek';
  if (appProperties?.defterIslem) return 'sihirbaz';
  return null;
}
