import type { Book } from '../model/types';
import type { DriveLocation } from '../drive/driveLibrary';
import { currentToken, kapsamDurumu } from '../drive/auth';
import { SourceResolver } from '../okuma/kaynakCoz';
import { drivePdfOlusturApi, yerKontrol } from '../drive/pdfOlustur';
import { DriveOcrTrial, type OcrOperation } from './driveDeneme';
import { prepare, type TrialImage } from './image';
import { score, scoreKnownTargets } from './score';

// Imported by main only under DEV and ?ocrDeneme=1. All transcripts stay in DOM/memory.
export function installOcrTrial(location: () => DriveLocation | null, books: () => Map<string, Book> | null): void {
  if (!import.meta.env.DEV) return;
  const host = document.createElement('section'); host.id = 'ocr64a';
  host.style.cssText = 'position:fixed;inset:12px;z-index:100000;background:#fff;color:#17202a;padding:20px;overflow:auto;font:15px/1.5 system-ui;border:2px solid #456;border-radius:12px';
  host.innerHTML = `<h2>OCR 6.4a · yalnız geliştirme · laptop</h2>
    <p>Üç seçili örnek; sadece PDF sayfa 1. Metin yalnız bu sekmenin belleğinde. Sekmeyi yenilemeden önce temizlik durumunu kontrol et.</p>
    <button id="ocr-hide">Paneli gizle / Google girişine dön</button>
    <p><label>Seçili örnek <input id="ocr-file" type="file" accept="image/jpeg,image/png,application/pdf"></label>
    <label>Yön düzeltme <select id="ocr-rotation"><option value="0">0°</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></label>
    <button id="ocr-prepare">Deneme görüntüsünü hazırla (OCR yok)</button></p>
    <img id="ocr-image" alt="İki yönteme verilecek aynı deneme görüntüsü" style="max-width:100%;max-height:450px;object-fit:contain">
    <p><label>Fotoğrafla doğrulanan referans (belirsiz kelimeleri yazma)<br><textarea id="ocr-reference" rows="7" style="width:95%"></textarea></label>
    <label>Puanlama <select id="ocr-score-mode"><option value="targets">Yalnız kesin hedef kelimeler (tüm sayfa doğruluğu değil)</option><option value="full">Paragraf/tam metin (belirsiz tek kelimeyi [belirsiz] yaz)</option></select></label>
    <label><input id="ocr-verified" type="checkbox"> Görüntüyle karşılaştırıldı; belirsiz kelimeler dışarıda veya [belirsiz] olarak işaretli</label></p>
    <details><summary>Kısa paragrafı sırayla karşılaştır (OCR/yükleme yapmaz)</summary>
    <label>OCR çıktısından aynen alınan paragraf<br><textarea id="ocr-excerpt" rows="4" style="width:95%"></textarea></label>
    <button id="ocr-compare-excerpt">Referanstaki paragrafla karşılaştır</button></details>
    <p>Karışık Türkçe/Almanca tek örnek olarak değerlendirilir. Cihaz modeli: tur+deu. Google dil ipucu: tr.</p>
    <p><button id="ocr-targets">Google hedef konularını listele (yalnız oku)</button> <select id="ocr-target"><option value="">Önce Google ile giriş ve kitaplık yükleme</option></select></p>
    <p><label><input id="ocr-consent" type="checkbox"> Seçili görüntüyü Google’a gönder; OCR geçici dosyasını oluştur ve çöpe taşı</label></p>
    <p><label><input id="ocr-narrow-only" type="checkbox" checked> Gerçek ikinci hesap kontrolü: yalnız mevcut drive.file + sahip=false ise yükle (izin isteğini değiştirmez)</label></p>
    <p><button id="ocr-local">Cihazda OCR (3 tur)</button> <button id="ocr-google">Google OCR (3 tur / ayrı işlem)</button>
    <button id="ocr-retry">Son Google işlemini tekrar dene (aynı kimlik)</button> <button id="ocr-clean">Bekleyen OCR temizliğini tekrar dene</button></p>
    <p id="ocr-status" role="status"></p><pre id="ocr-results" style="white-space:pre-wrap"></pre>`;
  document.body.append(host);
  const el = <T extends HTMLElement>(id: string) => host.querySelector<T>('#ocr-' + id)!;
  const status = (s: string) => { el('status').textContent = s; };
  const output = el('results');
  let image: TrialImage | undefined; let imageUrl = ''; let busy = false;
  const operations: OcrOperation[] = []; const report: object[] = [];
  let lockedImage: TrialImage | undefined;
  const pending = () => operations.some(o => o.sent && !o.cleanup.startsWith('Çöpte doğrulandı:'));
  const show = () => { output.textContent = JSON.stringify({ results: report, operations: operations.map(({ text: _, ...o }) => o), limits: 'Basılı yazı ve saf Almanca: örnek eksik, ölçülmedi.' }, null, 2); };
  const run = async (fn: () => Promise<void>) => {
    if (busy) return; busy = true;
    try { await fn(); } catch (e) { status(e instanceof Error ? e.message : 'Deneme hatası'); }
    finally { busy = false; show(); }
  };
  const bump = document.createElement('button'); bump.textContent = 'OCR denemesine dön';
  bump.style.cssText = 'position:fixed;top:8px;right:8px;z-index:100001;padding:12px;display:none';
  document.body.append(bump);
  el('hide').onclick = () => { host.hidden = true; bump.style.display = ''; };
  bump.onclick = () => { host.hidden = false; bump.style.display = 'none'; };
  window.addEventListener('beforeunload', e => { if (busy || pending()) { e.preventDefault(); e.returnValue = ''; } });
  el('prepare').onclick = () => void run(async () => {
    if (pending()) throw new Error('Önce bekleyen Google işlemini temizle; görüntü değişmedi.');
    const f = el<HTMLInputElement>('file').files?.[0]; if (!f) throw new Error('Önce seçili örnek dosyasını seç.');
    image = await prepare(f, Number(el<HTMLSelectElement>('rotation').value));
    if (imageUrl) URL.revokeObjectURL(imageUrl); imageUrl = URL.createObjectURL(image.blob);
    el<HTMLImageElement>('image').src = imageUrl;
    el<HTMLInputElement>('verified').checked = false;
    el<HTMLTextAreaElement>('reference').value = '';
    status(`Hazır: ${image.width}×${image.height}, ${image.blob.size} bayt, SHA-256 ${image.hash}. ${image.text !== null ? 'Mevcut PDF metni kullanılacak; OCR/yükleme yok.' : 'Metin katmanı yok; OCR henüz yapılmadı.'}`);
  });
  el('targets').onclick = () => void run(async () => {
    const loc = location(); if (!loc || !currentToken()) throw new Error('Önce paneli gizleyip uygulamadan Google ile giriş yap.');
    const select = el<HTMLSelectElement>('target'); select.replaceChildren(new Option('Bir deneme konusu seç', ''));
    for (const [id, book] of books() ?? []) for (const unit of book.uniteler) for (const topic of unit.konular) {
      if (!topic.klasor || !loc.bookFolderIds.has(id)) continue;
      const o = new Option(`${book.baslik} / ${topic.baslik}`, JSON.stringify([id, topic.klasor])); select.add(o);
    }
    const a = kapsamDurumu();
    status(`Hedefler hazır. İzin: ${a.aktif ?? 'yok'}; sahip: ${a.sahip}; scope: ${a.scopes.join(' ')}. URL kapsam/sahip zorlaması: ${new URLSearchParams(window.location.search).has('kapsam') || new URLSearchParams(window.location.search).has('sahip')}.`);
  });
  // No implicit refresh/sign-in, no shared Word/PPT uploader or cleanup. Use only the live token.
  const trial = new DriveOcrTrial(async (path, init) => {
    const a = kapsamDurumu();
    if (el<HTMLInputElement>('narrow-only').checked && (a.aktif !== 'dar' || a.sahip !== false || !a.scopes.includes('https://www.googleapis.com/auth/drive.file') || a.scopes.includes('https://www.googleapis.com/auth/drive') || new URLSearchParams(window.location.search).has('kapsam') || new URLSearchParams(window.location.search).has('sahip'))) throw new Error('Gerçek ikinci hesap/drive.file doğrulanmadı. İzin değiştirilmedi; istek gönderilmedi.');
    const token = currentToken(); if (!token || !location()) throw new Error('Google oturumu yok/süresi doldu. Yeniden girişten sonra aynı işlemi dene.');
    const headers = new Headers(init?.headers); headers.set('Authorization', `Bearer ${token}`);
    return fetch(path.startsWith('https://') ? path : 'https://www.googleapis.com/drive/v3/' + path, { ...init, headers });
  }, async parent => {
    const loc = location(); if (!loc) throw new Error('Drive kitaplığı açık değil.');
    const f = await yerKontrol(drivePdfOlusturApi, loc, parent);
    if (!f.canAddChildren) throw new Error('Hedefe ekleme izni yok.');
  });
  const add = (method: string, turn: number, text: string, ms: number, setupMs = 0, cleanupMs = 0, stages?: object) => {
    const ref = el<HTMLTextAreaElement>('reference').value;
    report.push({ input: image?.hash, category: 'El yazısı (dil örnekten elle belirlenir)', method, turn, setupMs, elapsedMs: ms, cleanupMs,
      preparationMs: image?.preparationMs, stages, comparison: el<HTMLInputElement>('verified').checked && ref.trim()
        ? (el<HTMLSelectElement>('score-mode').value === 'targets' ? scoreKnownTargets(ref, text) : score(ref, text)) : 'Referans doğrulanmadı; puan verilmedi.', text });
    show();
  };
  const requireImage = () => { if (!image) throw new Error('Önce görüntüyü hazırla.'); return image; };
  el('compare-excerpt').onclick = () => void run(async () => {
    const g = requireImage(), ref = el<HTMLTextAreaElement>('reference').value, actual = el<HTMLTextAreaElement>('excerpt').value;
    if (!el<HTMLInputElement>('verified').checked || !ref.trim() || !actual.trim()) throw new Error('Fotoğrafla doğrulanan referans ve OCR çıktısındaki gerçek paragraf gerekiyor.');
    report.push({ input: g.hash, method: 'Sıralı paragraf karşılaştırması (elle seçilen OCR alıntısı)', comparison: score(ref, actual), text: actual });
    status('Paragraf karşılaştırıldı; Drive isteği yapılmadı.');
  });
  el('local').onclick = () => void run(async () => {
    const g = requireImage(); if (g.text !== null) { add('Mevcut PDF metni; OCR yok', 1, g.text, 0); return; }
    status('Cihaz OCR hazırlanıyor…'); const setupStart = performance.now();
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker(['tur', 'deu'], 1, { cacheMethod: 'none' });
    const setup = performance.now() - setupStart;
    try { for (let i = 1; i <= 3; i++) { status(`Cihaz OCR ${i}/3…`); const start = performance.now(); const r = await worker.recognize(g.blob); add('Cihaz tur+deu', i, r.data.text, performance.now() - start, i === 1 ? setup : 0); } }
    finally { await worker.terminate(); }
    status('Cihazda 3 tur tamamlandı.');
  });
  const googleRun = async (op: OcrOperation, turn: number) => {
    const g = lockedImage!; const start = performance.now();
    try { const text = await trial.run(op, g.blob); add(`Google tr ipucu / ${kapsamDurumu().aktif}`, turn, text, op.processingMs ?? performance.now() - start, 0, op.cleanupMs, { createOcrMs: op.createMs, exportMs: op.exportMs, preflightMs: op.preflightMs, cacheHit: op.cacheHit, authorization: kapsamDurumu() }); }
    finally { show(); }
  };
  el('google').onclick = () => void run(async () => {
    const g = requireImage(); if (g.text !== null) { add('Mevcut PDF metni; Google çağrısı yok', 1, g.text, 0); return; }
    if (pending()) throw new Error('Önce son işlemi tekrar dene veya temizle.');
    if (!el<HTMLInputElement>('consent').checked) throw new Error('Google deneme onayı işaretli değil.');
    const loc = location(), value = el<HTMLSelectElement>('target').value;
    if (!loc || !value || !currentToken()) throw new Error('Giriş ve hedef konu gerekiyor.');
    const [book, path] = JSON.parse(value) as string[];
    const bookId = loc.bookFolderIds.get(book); if (!bookId) throw new Error('Kitap bulunamadı.');
    const parent = await new SourceResolver(bookId).resolveFolder(path); if (!parent) throw new Error('Konu klasörü bulunamadı.');
    lockedImage = g;
    for (let i = 1; i <= 3; i++) {
      const op: OcrOperation = { operation: crypto.randomUUID(), parent, fingerprint: g.hash, language: 'tr', sent: false, busy: false, cleanup: 'Henüz oluşturulmadı.' };
      operations.push(op); status(`Google OCR ${i}/3…`); await googleRun(op, i);
      if (!op.cleanup.startsWith('Çöpte doğrulandı:')) throw new Error(op.cleanup);
    }
    status('Google 3 tur tamamlandı; temizlik durumları aşağıda.');
  });
  el('retry').onclick = () => void run(async () => {
    const op = operations.at(-1); if (!op || !lockedImage) throw new Error('Tekrar denenecek Google işlemi yok.');
    if (image?.hash !== op.fingerprint) throw new Error('Görüntü değişmiş; eski işlem yeni görüntüyle raporlanamaz. Temizlik düğmesi eski işlemleri korur.');
    await googleRun(op, 0); status(`Aynı işlem: ${op.operation}. ${op.cleanup}`);
  });
  el('clean').onclick = () => void run(async () => { for (const op of operations) if (!op.cleanup.startsWith('Çöpte doğrulandı:')) await trial.cleanup(op); status('Yalnız bu sekmenin OCR işlemleri kontrol edildi.'); });
  show();
}
