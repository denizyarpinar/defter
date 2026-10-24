import { currentToken } from '../drive/auth';
import type { BookPage } from '../okuma/kitapSayfalari';
import type { PageContent } from '../okuma/sayfaIcerik';
import { pageKind } from '../okuma/sayfaIcerik';
import { DriveOcrTrial } from './driveDeneme';
import { prepare } from './image';
import { ReaderOcrSearch, type SearchPage } from './okuyucuArama';

export interface ReaderSnapshot {
  file: string; version: string; folder: string; content: PageContent;
  pages: { page: BookPage; index: number }[];
  go(index: number): void;
}

export function installReaderOcr(snapshot: () => ReaderSnapshot | null): void {
  if (!import.meta.env.DEV) return;
  const host = document.createElement('details'); host.id = 'reader-ocr-search';
  host.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;max-height:55vh;overflow:auto;z-index:10000;background:white;color:#17202a;padding:12px;border:2px solid #567;border-radius:10px;font:15px/1.5 system-ui';
  host.innerHTML = `<summary>Google OCR okuyucu araması · geliştirme</summary>
    <p>Yalnız açık dosyada, en fazla 5 sayfa. OCR metni bu oturumun belleğinde tutulur.
    Metin bulunan sayfalar Google’a gönderilmez; karma sayfalardaki el yazısı bölümleri bu durumda aranmaz.</p>
    <p data-file></p><label>PDF sayfa numaraları (ör. 1,3,5; fotoğraf için 1) <input data-pages inputmode="numeric" value="1" style="max-width:150px"></label>
    <button data-prepare>Sayfaları kontrol et (yükleme yok)</button>
    <p data-count>Google’a gönderilecek sayfa sayısı henüz hesaplanmadı.</p>
    <button data-start disabled>Google’a gönder ve başlat / aynı işlemi tekrar dene</button>
    <button data-cancel>İptal</button> <button data-clean>Bekleyen temizliği tekrar dene</button>
    <p>Google’da geçici Doküman oluşturulur, metin alınır ve yalnız bu işlemin dosyası çöpe taşınır. Kalıcı silme yapılmaz.
    Temizlik bitmeden sekmeyi kapatma; zorla kapanışta temizlik garanti edilemez.</p>
    <label>Aranacak kelime <input data-query type="search"></label><button data-search>Ara</button>
    <p data-status role="status"></p><div data-results></div><pre data-cleanup style="white-space:pre-wrap"></pre>`;
  document.body.append(host);
  const el = <T extends HTMLElement>(key: string) => host.querySelector<T>(`[data-${key}]`)!;
  let search: ReaderOcrSearch | undefined, bound: ReaderSnapshot | null = null;
  let epoch = 0, boundEpoch = -1, credential: string | undefined, invalid = false, working = false;
  const status = (message: string) => { el('status').textContent = message; };
  const valid = () => {
    const now = snapshot();
    return !invalid && !!currentToken() && epoch === boundEpoch && !!bound && !!now
      && now.file === bound.file && now.version === bound.version && now.content === bound.content
      && now.pages.map(p => `${p.index}:${p.page.pdfSayfa}`).join() === bound.pages.map(p => `${p.index}:${p.page.pdfSayfa}`).join();
  };
  const cleanupStatus = () => {
    el('cleanup').textContent = search?.pages.filter(p => p.operation).map(p => `s.${p.number}: ${p.operation!.cleanup || 'Temizlik bekliyor.'}`).join('\n') ?? '';
  };
  const invalidate = () => {
    if (!search || invalid) return;
    invalid = true; search.forget(); el('results').replaceChildren();
    el<HTMLButtonElement>('start').disabled = true;
    el('count').textContent = 'Eski sayfa seçimi ve sonuçlar geçersiz.';
    status('Dosya/sürüm veya oturum değişti. Eski metin temizlendi. Bekleyen temizlik varsa başarı sayılmaz; eski hesap erişimi kalıcı saklanmaz.');
    cleanupStatus();
  };
  window.addEventListener('defter-auth-change', () => { epoch++; invalidate(); });
  window.addEventListener('pagehide', () => { epoch++; invalidate(); });
  window.addEventListener('beforeunload', e => { if (working || search?.pending) { e.preventDefault(); e.returnValue = ''; } });
  // Observe local reader/version changes even when no search button is pressed.
  setInterval(() => {
    const now = snapshot(); host.hidden = !now && !search?.pending && !working;
    el('file').textContent = now ? `Açık dosya: ${now.pages[0]?.page.ad ?? now.file}; kullanılabilir PDF sayfaları: ${now.pages.map(p => p.page.pdfSayfa ?? 1).join(', ')}` : 'Aranabilir Drive dosyası açık değil.';
    if (search && !valid()) invalidate();
  }, 250);
  const send = async (path: string, init?: RequestInit): Promise<Response> => {
    if (!credential) throw new Error('Bu işlem için geçerli oturum yok. Temizlik doğrulanmadı.');
    // Cleanup GET/PATCH can finish with this action's old credential, never a new account's token.
    if ((init?.method === 'POST' || path.includes('/export?')) && (!valid() || search?.cancelled)) throw new Error('İptal edildi; yeni yükleme/metin isteği gönderilmedi.');
    const headers = new Headers(init?.headers); headers.set('Authorization', `Bearer ${credential}`);
    return fetch(path.startsWith('https://') ? path : 'https://www.googleapis.com/drive/v3/' + path, { ...init, headers, signal: AbortSignal.timeout(30_000) });
  };
  const metadata = async (id: string) => {
    const r = await send(`files/${encodeURIComponent(id)}?fields=id,mimeType,modifiedTime,parents,trashed,capabilities(canAddChildren)`);
    if (!r.ok) throw new Error(`Drive kontrolü başarısız (${r.status}); işlem tamamlanmadı.`);
    return r.json() as Promise<{ id: string; mimeType: string; modifiedTime: string; parents?: string[]; trashed: boolean; capabilities?: { canAddChildren?: boolean } }>;
  };
  let parent = '';
  const verify = async () => {
    if (!valid() || !bound) throw new Error('Dosya/oturum değişti.');
    const file = await metadata(bound.file);
    if (!valid()) throw new Error('Oturum değişti.');
    if (file.trashed || file.modifiedTime !== bound.version) { invalidate(); throw new Error('Drive dosyasının sürümü değişti. Dosyayı yeniden açıp sayfaları tekrar kontrol et.'); }
    if (file.parents?.length !== 1) throw new Error('Dosyanın hedef klasörü doğrulanamadı.');
    parent = file.parents[0]; let id = parent; const seen = new Set<string>();
    for (let depth = 0; depth < 12; depth++) {
      if (!valid()) throw new Error('Oturum değişti.');
      if (seen.has(id)) break; seen.add(id);
      const folder = await metadata(id);
      if (folder.trashed || folder.mimeType !== 'application/vnd.google-apps.folder' || (id === parent && !folder.capabilities?.canAddChildren)) break;
      if (id === bound.folder) return;
      if (folder.parents?.length !== 1) break;
      id = folder.parents[0];
    }
    throw new Error('Hedef, açık kitabın klasörü altında değil veya yazma izni yok.');
  };
  const action = async (fn: () => Promise<void>) => {
    if (working) return;
    working = true; credential = currentToken() ?? undefined;
    for (const key of ['prepare', 'start', 'search', 'clean']) el<HTMLButtonElement>(key).disabled = true;
    try { await fn(); }
    catch (e) { status(e instanceof Error ? e.message : 'Arama tamamlanmadı.'); }
    finally {
      credential = undefined; working = false; cleanupStatus();
      for (const key of ['prepare', 'search', 'clean']) el<HTMLButtonElement>(key).disabled = false;
      el<HTMLButtonElement>('start').disabled = !search?.pages.length || !valid();
    }
  };
  el('prepare').onclick = () => void action(async () => {
    if (search?.pending) throw new Error('Önce bekleyen temizliği tamamla. Hesap değiştiyse eski hesapla yeni inceleme gerekir; başarılı sayılmadı.');
    const now = snapshot(); if (!now || !credential) throw new Error('Önce Google ile giriş yap ve bir Drive dosyası aç.');
    const numbers = el<HTMLInputElement>('pages').value.split(',').map(x => Number(x.trim()));
    if (numbers.some(n => !Number.isInteger(n) || n < 1)) throw new Error('Sayfaları 1,3,5 biçiminde yaz.');
    const selected = numbers.map(number => {
      const found = now.pages.find(p => (p.page.pdfSayfa ?? 1) === number);
      if (!found || !['pdf', 'image'].includes(pageKind(found.page))) throw new Error(`s.${number} açık dosyada yok veya desteklenmiyor.`);
      return { number, index: found.index };
    });
    bound = now; boundEpoch = epoch; invalid = false;
    const page = (p: SearchPage) => now.pages.find(x => x.index === p.index)!.page;
    const trial = new DriveOcrTrial(send, async target => { await verify(); if (target !== parent) throw new Error('Hedef değişti.'); });
    search = new ReaderOcrSearch({ valid, verify, trial, get parent() { return parent; },
      text: async p => pageKind(page(p)) === 'pdf' ? (await now.content.textContent(page(p))).parcalar.map(x => x.str).join(' ') : '',
      image: async p => {
        const source = page(p);
        if (pageKind(source) === 'image') return prepare(new File([await now.content.image(source)], 'photo.jpg', { type: source.mimeType }), 0);
        const canvas = document.createElement('canvas');
        try {
          const v = await now.content.viewport(source), scale = Math.min(2, 2000 / Math.max(v.width, v.height));
          canvas.width = Math.ceil(v.width * scale); canvas.height = Math.ceil(v.height * scale);
          await now.content.drawPdf(source, canvas).promise;
          const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Görüntü hazırlanamadı.')), 'image/jpeg', .92));
          const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(n => n.toString(16).padStart(2, '0')).join('');
          return { blob, hash };
        } finally { canvas.width = canvas.height = 0; }
      }
    });
    el('results').replaceChildren();
    const count = await search.prepare(selected);
    el('count').textContent = `Google’a gönderilecek: ${count} sayfa. Mevcut metin kullanılacak: ${selected.length - count} sayfa. Henüz yükleme yapılmadı.`;
    status('Sayıyı kontrol edip Başlat düğmesine bas. Karma metinli sayfalardaki el yazısı aranmaz.');
  });
  el('start').onclick = () => void action(async () => {
    if (!search || !valid()) throw new Error('Önce sayfaları tekrar kontrol et.');
    status('Seçilen sayfalar işleniyor…'); await search.start();
    status(search.pending ? 'OCR tamamlandı; temizlik tamamlanmadı. Durumu aşağıdan kontrol et.' : 'Seçilen sayfalar hazır. OCR bazı kelimeleri yanlış veya eksik okuyabilir.');
  });
  el('cancel').onclick = () => { search?.cancel(); el('results').replaceChildren(); status('İptal istendi. Yeni sayfa gönderilmeyecek; başlamış isteğin temizliği beklenecek.'); };
  el('clean').onclick = () => void action(async () => {
    if (!search || !valid()) throw new Error('Eski oturumun erişimi tutulmadı. Temizlik doğrulanmadı; yeni hesapla temizlik yapılmadı.');
    await search.cleanup(); status(search.pending ? 'Temizlik tamamlanamadı.' : 'Geçici dosyaların temizlik durumu doğrulandı.');
  });
  el('search').onclick = () => void action(async () => {
    el('results').replaceChildren(); if (!search) throw new Error('Önce sayfaları kontrol et.');
    const matches = await search.matches(el<HTMLInputElement>('query').value);
    status(`${matches.length} eşleşen sayfa. OCR bazı kelimeleri yanlış/eksik okuyabilir; bulunamaması kelimenin sayfada olmadığı anlamına gelmez. ${search.pages.filter(p => p.text !== undefined).length}/${search.pages.length} sayfa hazır.`);
    for (const match of matches) {
      const button = document.createElement('button'); button.textContent = `PDF s.${match.page.number} · ${match.ocr ? 'OCR eşleşmesi' : 'Mevcut metin'}: ${match.excerpt}`;
      button.style.cssText = 'display:block;text-align:left;margin:8px 0;white-space:normal';
      button.onclick = () => void action(async () => { await verify(); if (valid()) { bound!.go(match.page.index); host.open = false; } });
      el('results').append(button);
    }
  });
}
