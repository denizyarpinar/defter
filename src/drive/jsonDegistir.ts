// Task 6.K5b: the one way a JSON file is changed by the contents' edit mode and the trash (was jsonaYaz in
// icindekilerYaz.ts, 6.K5a; the behaviour is the same): modifiedTime → the latest file → the change → modifiedTime
// again; changed meanwhile (another device) → once more from the start, then `cakisma`. No change → nothing written.
// PATCH on the same id.

export interface JsonDrive {
  jsonOku(id: string): Promise<unknown>;
  degisimZamani(id: string): Promise<string>;
  jsonYaz(id: string, obj: unknown): Promise<void>;
}

// true: written
export async function jsonDegistir(drive: JsonDrive, id: string, degistir: (latest: unknown) => { json: unknown; degisti: boolean }, cakisma: () => Error): Promise<boolean> {
  for (let tur = 1; ; tur++) {
    const once = await drive.degisimZamani(id);
    const { json, degisti } = degistir(await drive.jsonOku(id));
    if (!degisti) return false;
    if (await drive.degisimZamani(id) !== once) {
      if (tur >= 2) throw cakisma();
      continue;
    }
    await drive.jsonYaz(id, json);
    return true;
  }
}
