import { driveFetch, ok } from './drive';

// Task 4.8c, development only (loaded from Okuyucu.ts under import.meta.env.DEV, not in the build):
// window.defterSurumler(fileId?) shows a PDF's revisions and its head revision in the console.
// READS ONLY: two GET requests, nothing is written.

interface Rev { id: string; modifiedTime?: string; keepForever?: boolean; size?: string }

export function installRevisionHelper(openFileId: () => string | null): void {
  (window as unknown as { defterSurumler: (id?: string) => Promise<void> }).defterSurumler = async (fileId?: string) => {
    const id = fileId ?? openFileId();
    if (!id) { console.warn('defterSurumler: okuyucuda açık PDF yok. Bir fileId ver: defterSurumler("…")'); return; }
    const f = `files/${encodeURIComponent(id)}`;
    const revs: Rev[] = [];
    let pageToken: string | undefined;
    do {
      const q = new URLSearchParams({ fields: 'nextPageToken,revisions(id,modifiedTime,keepForever,size)' });
      if (pageToken) q.set('pageToken', pageToken);
      const j = await (await ok(await driveFetch(`${f}/revisions?${q}`), 'Sürümler okunurken')).json() as { revisions?: Rev[]; nextPageToken?: string };
      revs.push(...(j.revisions ?? []));
      pageToken = j.nextPageToken;
    } while (pageToken);
    const head = (await (await ok(await driveFetch(`${f}?fields=headRevisionId`), 'Sürüm okunurken')).json() as { headRevisionId?: string }).headRevisionId ?? '';
    console.log(`defterSurumler: ${id} · headRevisionId = ${head}`);
    console.table(revs.map(r => ({ id: r.id, modifiedTime: r.modifiedTime, keepForever: r.keepForever === true, size: r.size, head: r.id === head })));
  };
}
