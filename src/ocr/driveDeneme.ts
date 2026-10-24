// 6.4a: development-only, memory-only trial. No Word/PPT temporary marker or sweep.
export const OCR_MARK = 'defterOcr64a';
const DOC = 'application/vnd.google-apps.document';
type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;
interface Meta { id: string; mimeType: string; parents?: string[]; trashed?: boolean; appProperties?: Record<string, string> }
export interface OcrOperation {
  readonly operation: string; readonly parent: string; readonly fingerprint: string; readonly language: string;
  sent: boolean; id?: string; text?: string; busy: boolean; cleanup: string;
  processingMs?: number; cleanupMs?: number; createMs?: number; exportMs?: number; preflightMs?: number; cacheHit?: boolean;
}
const fields = 'id,mimeType,parents,trashed,appProperties';
const quote = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const check = async (r: Response) => { if (!r.ok) throw new Error(`Drive OCR isteği başarısız (${r.status}).`); return r; };

export class DriveOcrTrial {
  constructor(private fetcher: Fetcher, private validateParent: (parent: string) => Promise<void>, private enabled: () => boolean = () => import.meta.env.DEV) {}
  private guard(): void { if (!this.enabled()) throw new Error('OCR denemesi yalnız geliştirmede çalışır.'); }
  private ours(f: Meta, op: OcrOperation): boolean {
    return f.mimeType === DOC && f.parents?.length === 1 && f.parents[0] === op.parent
      && f.appProperties?.[OCR_MARK] === '1' && f.appProperties?.ocrIslem === op.operation
      && f.appProperties?.ocrGirdi === op.fingerprint && f.appProperties?.ocrDil === op.language;
  }
  private async find(op: OcrOperation): Promise<Meta | undefined> {
    const q = `'${quote(op.parent)}' in parents and appProperties has { key='${OCR_MARK}' and value='1' } and appProperties has { key='ocrIslem' and value='${quote(op.operation)}' }`;
    let token = ''; const matches: Meta[] = [];
    do {
      const p = new URLSearchParams({ q, fields: `nextPageToken,files(${fields})`, pageSize: '100' });
      if (token) p.set('pageToken', token);
      const j = await (await check(await this.fetcher('files?' + p))).json() as { files?: Meta[]; nextPageToken?: string };
      for (const f of j.files ?? []) {
        if (!this.ours(f, op)) throw new Error(`OCR dosya işaretleri uyuşmuyor: ${f.id}. Dokunulmadı.`);
        matches.push(f);
      }
      token = j.nextPageToken ?? '';
    } while (token);
    if (matches.length > 1) throw new Error(`Aynı OCR işlemi için birden fazla dosya bulundu: ${matches.map(f => f.id).join(', ')}. Dokunulmadı.`);
    return matches[0];
  }
  async cleanup(op: OcrOperation): Promise<void> {
    this.guard();
    try {
      const f = op.id
        ? await (await check(await this.fetcher(`files/${encodeURIComponent(op.id)}?fields=${fields}`))).json() as Meta
        : await this.find(op);
      if (!f) {
        op.cleanup = op.sent ? `BULUNAMADI: ${op.operation}. Oluşmuş dosya olabilir; aynı işlemle yalnız yeniden ara.` : 'Dosya oluşturulmadı.';
        return;
      }
      if (!this.ours(f, op)) throw new Error('İşaret/klasör uyuşmuyor; dosyaya dokunulmadı.');
      op.id = f.id;
      if (!f.trashed) {
        await check(await this.fetcher(`files/${encodeURIComponent(f.id)}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }) }));
        const confirmed = await (await check(await this.fetcher(`files/${encodeURIComponent(f.id)}?fields=${fields}`))).json() as Meta;
        if (!this.ours(confirmed, op) || confirmed.trashed !== true) throw new Error('Çöpe taşınma doğrulanamadı.');
      }
      op.cleanup = `Çöpte doğrulandı: ${f.id}`;
    } catch (e) { op.cleanup = `TEMİZLENEMEDİ: ${op.id ?? op.operation}. ${e instanceof Error ? e.message : 'Drive hatası'}`; }
  }
  async run(op: OcrOperation, image: Blob): Promise<string> {
    this.guard();
    if (op.busy) throw new Error('Aynı OCR işlemi zaten çalışıyor.');
    if (image.size > 2_000_000 || !['image/jpeg', 'image/png'].includes(image.type)) throw new Error('Deneme görüntüsü JPEG/PNG ve en fazla 2 MB olmalı.');
    // Lock before *any* await, including hashing, to protect double clicks.
    op.busy = true;
    const start = performance.now();
    op.createMs = op.exportMs = op.preflightMs = 0; op.cacheHit = false;
    try {
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await image.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
      if (hash !== op.fingerprint || !['tr', 'de'].includes(op.language)) throw new Error('İşlemin görüntüsü/dili değişti. Yeni işlem gerekir.');
      await this.validateParent(op.parent);
      if (op.text !== undefined) { op.cacheHit = true; return op.text; }
      let f = op.id
        ? await (await check(await this.fetcher(`files/${encodeURIComponent(op.id)}?fields=${fields}`))).json() as Meta
        : await this.find(op);
      if (!f && op.sent) throw new Error(`BULUNAMADI: ${op.operation}. Önceki oluşturmanın yanıtı belirsiz; çift dosyayı önlemek için yeniden oluşturulmadı. Tekrar dene yalnız arar.`);
      op.preflightMs = performance.now() - start;
      if (!f) {
        const createStart = performance.now();
        const boundary = `ocr-${crypto.randomUUID()}`;
        const metadata = { name: `~OCR 6.4a ${op.operation}`, mimeType: DOC, parents: [op.parent], appProperties: { [OCR_MARK]: '1', ocrIslem: op.operation, ocrGirdi: op.fingerprint, ocrDil: op.language } };
        const body = new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${image.type}\r\n\r\n`, image, `\r\n--${boundary}--\r\n`]);
        // Google Docs conversion cannot use a pre-generated file ID. After any uncertain
        // POST outcome, never POST again for this operation, even if listing is delayed.
        op.sent = true;
        try {
          const r = await check(await this.fetcher(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&ocrLanguage=${op.language}&fields=${fields}`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }));
          f = await r.json() as Meta;
          if (typeof f.id === 'string') op.id = f.id;
        } catch (e) {
          f = await this.find(op);
          if (!f) throw new Error(`BULUNAMADI: ${op.operation}. Oluşturma yanıtı belirsiz; yeniden oluşturulmadı. ${e instanceof Error ? e.message : ''}`);
        } finally { op.createMs = performance.now() - createStart; }
      }
      if (!this.ours(f, op)) throw new Error('OCR dosya işaretleri doğrulanamadı.');
      op.id = f.id;
      if (f.trashed) throw new Error('Geçici OCR dosyası zaten çöpte; yeniden oluşturulmadı.');
      const exportStart = performance.now();
      try { op.text = await (await check(await this.fetcher(`files/${encodeURIComponent(f.id)}/export?mimeType=text%2Fplain`))).text(); }
      finally { op.exportMs = performance.now() - exportStart; }
      return op.text;
    } finally {
      op.processingMs = performance.now() - start;
      const cleanupStart = performance.now();
      if (op.sent || op.id) await this.cleanup(op);
      op.cleanupMs = performance.now() - cleanupStart;
      op.busy = false;
    }
  }
}
