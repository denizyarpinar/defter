import { expect, it } from 'vitest';
import { score, scoreKnownTargets, words } from './score';
it('literal words preserve special characters and case', () => {
  expect(words('İş, ışık! Straße äöü')).toEqual(['İş', 'ışık', 'Straße', 'äöü']);
  expect(score('İş ışık Straße', 'Is ışık Strasse')).toEqual({ total: 3, correct: 1, wrong: 2, missing: 0, extra: 0 });
});
it('reports omissions and inserted words without inventing reference text', () => {
  expect(score('bir iki üç dört', 'bir üç dört ek')).toEqual({ total: 4, correct: 3, wrong: 0, missing: 1, extra: 1 });
});
it('partial references ignore unknown spans but require exact target spellings in order', () => {
  expect(scoreKnownTargets('girinti süslü parantez ışık Straße', 'GİRİNTİ bilinmeyen süslü parantez isik Strasse')).toMatchObject({ total: 5, found: 3, missed: 2 });
  expect(scoreKnownTargets('bir bir iki', 'bir iki')).toMatchObject({ total: 3, found: 2, missed: 1 });
});
it('paragraph alignment penalizes word order and distinguishes wrong, missing and extra words', () => {
  expect(score('bir iki üç dört', 'iki bir üç dört')).toMatchObject({ total: 4, correct: 3, missing: 1, extra: 1, wrong: 0 });
  expect(score('bir iki üç', 'bir dört üç ek')).toMatchObject({ correct: 2, wrong: 1, extra: 1, missing: 0 });
});
it('one uncertain reference word is excluded without hiding extra output words', () => {
  expect(score('bir [belirsiz] üç', 'bir tahmin üç')).toEqual({ total: 2, unknown: 1, correct: 2, wrong: 0, missing: 0, extra: 0 });
  expect(score('bir [belirsiz] üç', 'bir tahmin fazla üç')).toMatchObject({ total: 2, unknown: 1, correct: 2, extra: 1 });
});
