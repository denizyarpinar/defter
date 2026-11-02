// Coordinates are in the same space as the supplied row centres. The scope is
// explicit so a future cross-unit drop can identify its unit without enabling it.
export function hedefSira(ortaNoktalar: number[], kaynak: number, y: number): number {
  let hedef = kaynak;
  for (let i = 0; i < ortaNoktalar.length; i++) {
    if (i < kaynak && y < ortaNoktalar[i]) return i;
    if (i > kaynak && y > ortaNoktalar[i]) hedef = i;
  }
  return hedef;
}

export function surukleHedefi(ortaNoktalar: number[], kaynak: number, y: number, unite: number | null) {
  return { unite, sira: hedefSira(ortaNoktalar, kaynak, y) };
}

export function siraTasi<T>(dizi: T[], kaynak: number, hedef: number): T[] {
  const sonuc = [...dizi];
  if (!Number.isInteger(kaynak) || !Number.isInteger(hedef)
    || kaynak < 0 || hedef < 0 || kaynak >= dizi.length || hedef >= dizi.length) return sonuc;
  const [oge] = sonuc.splice(kaynak, 1);
  sonuc.splice(hedef, 0, oge);
  return sonuc;
}
