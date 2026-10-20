// 6.K4c: a create goes only into the root's kitaplar/ or a folder this operation made (pure).
// Task 6.K5a: the same rule for the contents' new folders (the book's folder or one of its unit folders).
export const ebeveynGecerliMi = (ebeveynId: string, kitaplarId: string, izinli: ReadonlySet<string>): boolean =>
  ebeveynId === kitaplarId || izinli.has(ebeveynId);
