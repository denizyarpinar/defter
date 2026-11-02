import { transformWithOxc } from 'vite';
import { expect, it, vi } from 'vitest';
import { FOLDER_MIME, listChildren, type DriveFile } from '../drive/drive';
import { SourceResolver } from './kaynakCoz';
import { discoverTopic, type TopicMaterials } from './konuKesfi';
import { konuKesfet } from './konuAra';
import readerSource from './Okuyucu.ts?raw';

vi.mock('../drive/drive', async importOriginal => ({
  ...await importOriginal<typeof import('../drive/drive')>(),
  listChildren: vi.fn()
}));

// Run the actual reader functions without mounting its DOM/PDF UI. Compile the reader with Vite, then extract declarations
// so this regression covers production topicFolderId/discover/invalidation, rather than a copied resolver.
async function readerFolders() {
  const compiled = await transformWithOxc(readerSource, 'Okuyucu.ts');
  const names = ['discover', 'topicFolderId', 'okuyucuYolTasi'];
  const declarations = names.map(name => {
    const declaration = compiled.code.match(new RegExp(`^(?:export )?(?:async )?function ${name}\\([\\s\\S]*?^}`, 'm'))?.[0];
    expect(declaration, name).toBeDefined();
    return declaration!.replace(/^export /, '');
  });
  const code = declarations.join('\n');
  return new Function('SourceResolver', 'discoverTopic', `
    let resolver = null;
    const folder = 'kb', topicCache = new Map();
    const book = null, topic = null;
    const isSampleId = () => false;
    const dilT = key => key;
    ${code}
    return { discover, topicFolderId, okuyucuYolTasi };
  `)(SourceResolver, discoverTopic) as {
    discover(folderId: string, path: string): Promise<TopicMaterials | null>;
    topicFolderId(topic: { klasor: string }): Promise<string>;
    okuyucuYolTasi(bookId: string, oldPath: string, newPath: string): void;
  };
}

it('opens the new path, completes the background JSON fix, then resolves the open topic folder for file/photo adding', async () => {
  const oldPath = 'Unite-01-A/Konu-01-X', newPath = 'Unite-02-B/Konu-01-X';
  const tree: Record<string, Partial<DriveFile>[]> = {
    kb: [{ id: 'u1', name: 'Unite-01-A', mimeType: FOLDER_MIME }, { id: 'u2', name: 'Unite-02-B', mimeType: FOLDER_MIME }],
    u1: [], u2: [{ id: 't1', name: 'Konu-01-X', mimeType: FOLDER_MIME }],
    t1: [{ id: 'f1', name: 'ozet.pdf', mimeType: 'application/pdf' }]
  };
  vi.mocked(listChildren).mockImplementation(async (parent, opts) =>
    (tree[parent] ?? []).filter(f => !opts?.name || f.name === opts.name) as DriveFile[]);
  const reader = await readerFolders();
  let finishFix!: () => void;
  const fixPending = new Promise<void>(resolve => { finishFix = resolve; });
  const fixFinished = fixPending.then(() => reader.okuyucuYolTasi('book', oldPath, newPath));
  const opened = await konuKesfet(oldPath, {
    kesfet: path => reader.discover('kb', path),
    bul: async () => newPath,
    unut: () => reader.okuyucuYolTasi('book', oldPath, newPath)
  });
  expect(opened.klasor).toBe(newPath);
  expect(opened.m?.ozet[0].file.id).toBe('f1');
  finishFix();
  await fixFinished;
  const callsBeforeAdding = vi.mocked(listChildren).mock.calls.length;
  expect(await reader.topicFolderId({ klasor: opened.klasor })).toBe('t1');
  expect(listChildren).toHaveBeenCalledTimes(callsBeforeAdding + 2);
  // A second file/photo operation reuses the resolver recreated after the fix.
  expect(await reader.topicFolderId({ klasor: opened.klasor })).toBe('t1');
  expect(listChildren).toHaveBeenCalledTimes(callsBeforeAdding + 2);
});
