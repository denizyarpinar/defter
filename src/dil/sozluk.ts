import type { tr } from './tr';

// Task 6.5-1: the shape every language's dictionary has (taken from tr.ts)

export type Dil = 'en' | 'tr';
export const DILLER: readonly Dil[] = ['en', 'tr'];

export interface Cogul { readonly bir: string; readonly cok: string }
export type Anahtar = keyof typeof tr;
export type Sozluk = { readonly [K in Anahtar]: (typeof tr)[K] extends string ? string : Cogul };
