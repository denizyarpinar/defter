import { DriveError, FOLDER_MIME, driveFetch, findRootFolders, ok } from './drive';
import type { DriveLocation } from './driveLibrary';

// Task 5.11, development only (loaded from main.ts under import.meta.env.DEV, not in the build):
// window.defterOfisDene() — trial: can Drive turn a Word/PowerPoint file into a PDF for us?
// A "Dosya seç" button shows up in the corner (the browser opens a file chooser only after a tap).
// The file is uploaded with conversion into the "Defter-ceviri-deneme" folder in the Drive root (made if
// missing; only here, only this folder), exported as PDF, timings and sizes go to the console, and a
// button opens the PDF in a new tab. The temporary Google file is NOT deleted; nothing is added to a topic.

const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/';
const KLASOR = 'Defter-ceviri-deneme';
const DOC = 'application/vnd.google-apps.document';
const SLIDES = 'application/vnd.google-apps.presentation';
const MULTIPART_LIMIT = 5 * 1024 * 1024;
const ne = 'defterOfisDene';

// extension → the file's own type and the Google type it becomes (browsers often give no type for .odp / .ppt)
const TURLER: Record<string, { mime: string; hedef: string }> = {
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', hedef: DOC },
  doc: { mime: 'application/msword', hedef: DOC },
  odt: { mime: 'application/vnd.oasis.opendocument.text', hedef: DOC },
  pptx: { mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', hedef: SLIDES },
  ppt: { mime: 'application/vnd.ms-powerpoint', hedef: SLIDES },
  odp: { mime: 'application/vnd.oasis.opendocument.presentation', hedef: SLIDES }
};

const sn = (ms: number) => `${(ms / 1000).toFixed(1)} sn`;
const mb = (n: number) => `${(n / 1e6).toFixed(2)} MB`;

// A box in the corner with buttons; removed by ✕ or by the next call
function kutu(): HTMLDivElement {
  document.getElementById('defterOfisDene')?.remove();
  const k = document.createElement('div');
  k.id = 'defterOfisDene';
  k.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;gap:8px;font:14px sans-serif';
  document.body.append(k);
  return k;
}

function dugme(metin: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = metin;
  b.style.cssText = 'padding:10px 14px;border-radius:8px;border:1px solid #888;background:#fff;cursor:pointer';
  return b;
}

// null: the user closed it
function dosyaSec(): Promise<File | null> {
  return new Promise(resolve => {
    const k = kutu();
    const sec = dugme('Ofis dosyası seç (5.11 deneme)');
    const kapat = dugme('✕');
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = Object.keys(TURLER).map(u => '.' + u).join(',');
    input.style.display = 'none';
    const bitir = (f: File | null) => { k.remove(); resolve(f); };
    input.addEventListener('change', () => bitir(input.files?.[0] ?? null));
    sec.addEventListener('click', () => input.click());
    kapat.addEventListener('click', () => bitir(null));
    k.append(sec, kapat, input);
  });
}

// window.open after the async work would be stopped by the popup blocker: open on a tap instead
function pdfDugmesi(url: string): void {
  const k = kutu();
  const ac = dugme('PDF\'i yeni sekmede aç');
  const kapat = dugme('✕');
  ac.addEventListener('click', () => window.open(url, '_blank'));
  kapat.addEventListener('click', () => { k.remove(); URL.revokeObjectURL(url); });
  k.append(ac, kapat);
}

async function klasorBul(): Promise<string> {
  const var_ = await findRootFolders(KLASOR);
  if (var_.length) return var_[0].id;
  const res = await ok(await driveFetch('files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=UTF-8' },
    body: JSON.stringify({ name: KLASOR, mimeType: FOLDER_MIME, parents: ['root'] })
  }), 'Deneme klasörü oluşturulurken');
  console.log(`${ne}: Drive kökünde "${KLASOR}" klasörü oluşturuldu.`);
  return (await res.json() as { id: string }).id;
}

interface Yuklenen { id: string; name: string; mimeType: string; webViewLink?: string }

// Upload with conversion (Drive turns the file into a Google Doc / Slides in the same request)
async function yukleCevir(dosya: File, mime: string, meta: object): Promise<Yuklenen> {
  const what = 'Dosya yüklenip çevrilirken';
  const fields = 'fields=id,name,mimeType,webViewLink';
  let res: Response;
  if (dosya.size <= MULTIPART_LIMIT) {
    const boundary = 'defter' + Math.random().toString(36).slice(2);
    const body = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n`,
      `--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`, dosya, `\r\n--${boundary}--`
    ]);
    res = await driveFetch(`${UPLOAD}files?uploadType=multipart&${fields}`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body
    });
  } else {
    const bas = await ok(await driveFetch(`${UPLOAD}files?uploadType=resumable&${fields}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(dosya.size) },
      body: JSON.stringify(meta)
    }), what);
    const yer = bas.headers.get('Location');
    if (!yer) throw new Error(`${what}: yükleme oturumu açılamadı (Location yok).`);
    res = await driveFetch(yer, { method: 'PUT', headers: { 'Content-Type': mime }, body: dosya });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`${ne}: Drive yanıtı (${res.status}): ${text.slice(0, 500)}`);
    if (/insufficient.*scope|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(text)) throw new Error('Google izni (kapsam) yetmiyor: bu deneme için yeni izin gerekir. Dur ve Deniz\'e söyle.');
    throw new DriveError(res.status, what);
  }
  return await res.json() as Yuklenen;
}

// Which Google types Drive accepts this file type for (live check, e.g. old .doc / .ppt)
async function iceAktarma(mime: string): Promise<string[] | null> {
  try {
    const res = await ok(await driveFetch('about?fields=importFormats'), 'İçe aktarma biçimleri okunurken');
    return (await res.json() as { importFormats?: Record<string, string[]> }).importFormats?.[mime] ?? [];
  } catch { return null; }
}

export function installOfisDene(activeLocation: () => DriveLocation | null): void {
  (window as unknown as { defterOfisDene: () => Promise<void> }).defterOfisDene = async () => {
    if (!activeLocation()) {
      console.warn(`${ne}: Drive kitaplığı açık değil (giriş yapıp kitaplığın yüklenmesini bekle).`);
      return;
    }
    try {
      console.log(`${ne}: sağ alttaki "Ofis dosyası seç" düğmesine bas.`);
      const dosya = await dosyaSec();
      if (!dosya) { console.log(`${ne}: vazgeçildi.`); return; }
      const uzanti = dosya.name.split('.').pop()?.toLowerCase() ?? '';
      const tur = TURLER[uzanti];
      if (!tur) { console.warn(`${ne}: ${dosya.name}: desteklenmeyen uzantı (${Object.keys(TURLER).join(', ')}).`); return; }

      const kabul = await iceAktarma(tur.mime);
      if (kabul) console.log(`${ne}: Drive bu türü (${tur.mime}) şuna çevirebiliyor: ${kabul.length ? kabul.join(', ') : 'HİÇBİRİ'}`);

      const klasor = await klasorBul();
      const ad = dosya.name.replace(/\.[^.]+$/, '') + ` (5.11 deneme ${new Date().toLocaleString('tr-TR')})`;
      const meta = { name: ad, parents: [klasor], mimeType: tur.hedef, appProperties: { defter: '1' } };

      const t0 = performance.now();
      const g = await yukleCevir(dosya, tur.mime, meta);
      const t1 = performance.now();

      const res = await driveFetch(`files/${encodeURIComponent(g.id)}/export?mimeType=application%2Fpdf`);
      const t2 = performance.now();   // the answer starts once Drive has made the PDF
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn(`${ne}: export yanıtı (${res.status}): ${text.slice(0, 500)}`);
        if (/exportSizeLimitExceeded/i.test(text)) throw new Error('PDF 10 MB sınırını aştı: Drive bu dosyayı PDF olarak veremiyor (files.export sınırı).');
        throw new DriveError(res.status, 'PDF indirilirken');
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const t3 = performance.now();

      let sayfa = '?';
      try {
        const { PDFDocument } = await import('pdf-lib');
        sayfa = String((await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount());
      } catch (e) { console.warn(`${ne}: pdf-lib sayfa sayısını okuyamadı: ${e}`); }

      console.log(`${ne}: ${dosya.name} (${mb(dosya.size)}) → PDF ${mb(bytes.byteLength)}, ${sayfa} sayfa`);
      console.log(`${ne}: süreler · yükleme + Google'a çevirme ${sn(t1 - t0)} · PDF üretimi ${sn(t2 - t1)} · indirme ${sn(t3 - t2)} · toplam ${sn(t3 - t0)}`);
      console.log(`${ne}: geçici Google dosyası (silinmedi): "${g.name}" · ${g.mimeType}`);
      console.log(g.webViewLink ?? `https://drive.google.com/open?id=${g.id}`);

      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
      console.log(`${ne}: PDF: ${url} (sağ alttaki "PDF'i yeni sekmede aç" düğmesi)`);
      pdfDugmesi(url);
    } catch (e) {
      console.error(`${ne}: ${e instanceof Error ? `${e.constructor.name}: ${e.message}` : String(e)}`);
    }
  };
}
