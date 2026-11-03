export const TAHMIN_SADECE_KALEM = true;

export function tahminSadeceKalem(search: string): boolean {
  return TAHMIN_SADECE_KALEM && new URLSearchParams(search).get('tahmin') !== '1';
}

export function tahminKullan(pointerType: string, acik = TAHMIN_SADECE_KALEM): boolean {
  return !acik || pointerType === 'pen';
}
