// Prices live only here. ESTIMATE, not verified against the live price page: taken from the
// claude-api guide's cached table (6 October 2026). USD per 1M tokens; output includes thinking.
export const FIYATLAR = {
  'claude-haiku-5-5': { ad: 'Haiku 5.5', giris: 0.10, cikis: 0.50 },
  'claude-sonnet-5-5': { ad: 'Sonnet 5.5', giris: 2, cikis: 10 }
} as const;

export type OkuModel = keyof typeof FIYATLAR;
export const MODELLER = Object.keys(FIYATLAR) as OkuModel[];
export const MALIYET_NOTU = 'tahmini; kesin tutar Claude Console > Usage';

export function maliyet(model: OkuModel, k: { input_tokens: number; output_tokens: number }): number {
  const f = FIYATLAR[model];
  return (k.input_tokens * f.giris + k.output_tokens * f.cikis) / 1_000_000;
}

export const dolarYaz = (x: number): string => `$${x.toFixed(x < 0.01 ? 5 : 4)}`;
