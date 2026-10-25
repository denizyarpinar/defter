import { aktifKapsam, prepareAuth, signIn, AuthError, authErrorMessage } from '../drive/auth';
import { getUser } from '../drive/drive';
import { ATLAS_JSON, ATLAS_PNG, EL_YAZISI_KLASORU, SISTEM_KLASORU, atlasYukle, driveAtlasApi, type AtlasYuklemeSonucu } from './atlasDrive';
import { atlasJsonOku, pngKontrol, type ElYazisiAtlas } from './atlasSema';

// 6.4d-3 upload page (atlas-yukle.html, dev only; not a build input, so it never ships).
// Sign in → pick el-yazisi-atlas.png + .json (tools/atlas `uret.py paket`) → shape check → upload into
// <library root>/_sistem/el-yazisi/ (atlasDrive.ts) → read back, size + SHA-256 → the result table.
// Nothing is stored in the browser; the token stays in memory (auth.ts).

const app = document.getElementById('app')!;
if (!import.meta.env.DEV) app.textContent = 'Bu sayfa yalnız geliştirmede çalışır.';
else kur();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...cocuk: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) k === 'class' ? (e.className = v) : e.setAttribute(k, v);
  e.append(...cocuk);
  return e;
}

const hata = (e: unknown) => e instanceof AuthError ? authErrorMessage(e.code) : e instanceof Error ? e.message : String(e);
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

function kur(): void {
  const girisBtn = el('button', { id: 'giris' }, 'Google ile giriş');
  const girisDurum = el('span', { class: 'not', id: 'girisDurum' }, 'Giriş yok');
  const hedef = el('p', { class: 'not', id: 'hedef' }, 'Hedef klasör girişten sonra gösterilir.');
  const dosya = el('input', { id: 'dosya', type: 'file', multiple: '', accept: '.png,.json,image/png,application/json' });
  const dosyaDurum = el('p', { class: 'not', id: 'dosyaDurum' }, `İki dosyayı birlikte seç: ${ATLAS_PNG} ve ${ATLAS_JSON}.`);
  const yukleBtn = el('button', { id: 'yukle', class: 'ana' }, 'Drive\'a yükle');
  const durum = el('p', { class: 'durum', id: 'durum', role: 'status' });
  const sonucKutu = el('div', { id: 'sonuc' });

  app.append(
    el('h1', {}, 'El yazısı atlası · Drive\'a yükleme · 6.4d-3'),
    el('p', { class: 'not' }, `Yalnız geliştirme. Dosyalar kitaplık klasörünün içinde ${SISTEM_KLASORU}/${EL_YAZISI_KLASORU}/ altına yüklenir; aynı adlı dosya varsa içeriği güncellenir.`),
    el('section', {}, el('h2', {}, '1. Giriş'), el('div', { class: 'satirlar' }, girisBtn, girisDurum), hedef),
    el('section', {}, el('h2', {}, '2. Dosyalar'), dosya, dosyaDurum),
    el('section', {}, el('h2', {}, '3. Yükle'), yukleBtn, durum, sonucKutu)
  );

  let girisli = false, calisiyor = false;
  let secim: { png: Uint8Array; json: Uint8Array; atlas: ElYazisiAtlas } | null = null;
  const kilitle = () => { yukleBtn.disabled = calisiyor || !girisli || !secim; girisBtn.disabled = calisiyor; };
  kilitle();
  void prepareAuth().catch(e => { girisDurum.textContent = hata(e); });

  girisBtn.onclick = async () => {
    girisDurum.textContent = 'Bağlanıyor…';
    try {
      await signIn({ chooseAccount: true });
      girisli = true;
      let eposta = 'e-posta alınamadı';
      try { eposta = (await getUser()).email || eposta; } catch { /* only shown */ }
      girisDurum.textContent = `Girişli: ${eposta} · kapsam ${aktifKapsam() ?? '?'} (token sadece bellekte)`;
      hedef.textContent = 'Kitaplık klasörü aranıyor…';
      const kok = await driveAtlasApi.kok();
      hedef.textContent = kok ? `Hedef: ${kok.name}/${SISTEM_KLASORU}/${EL_YAZISI_KLASORU}/` : 'Kitaplık klasörü bulunamadı. Önce uygulamada kitaplığını kur.';
    } catch (e) {
      girisDurum.textContent = hata(e);
    }
    kilitle();
  };

  dosya.onchange = async () => {
    secim = null; sonucKutu.replaceChildren(); durum.textContent = ''; kilitle();
    const liste = [...dosya.files ?? []];
    const png = liste.find(f => f.name === ATLAS_PNG), json = liste.find(f => f.name === ATLAS_JSON);
    if (liste.length !== 2 || !png || !json) {
      dosyaDurum.textContent = `Tam olarak iki dosya seç: ${ATLAS_PNG} ve ${ATLAS_JSON} (adlar aynen).`;
      dosyaDurum.classList.add('hata');
      return;
    }
    try {
      const [p, j] = await Promise.all([png.arrayBuffer(), json.arrayBuffer()]).then(b => b.map(x => new Uint8Array(x)));
      const atlas = atlasJsonOku(new TextDecoder().decode(j));
      pngKontrol(p, atlas);
      secim = { png: p, json: j, atlas };
      const ornek = Object.values(atlas.karakterler).reduce((t, oo) => t + oo.length, 0);
      dosyaDurum.textContent = `Geçerli: ${Object.keys(atlas.karakterler).length} karakter, ${ornek} örnek, sayfa ${atlas.sayfa.w}×${atlas.sayfa.h}, `
        + `kodlama ${atlas.kodlama} · PNG ${kb(p.length)}, JSON ${kb(j.length)} · eksik: ${atlas.eksikler.join(' ') || 'yok'}`;
      dosyaDurum.classList.remove('hata');
    } catch (e) {
      dosyaDurum.textContent = hata(e);
      dosyaDurum.classList.add('hata');
    }
    kilitle();
  };

  yukleBtn.onclick = async () => {
    if (!secim) return;
    calisiyor = true; kilitle();
    durum.textContent = 'Yükleniyor…'; durum.classList.remove('hata');
    sonucKutu.replaceChildren();
    try {
      const r = await atlasYukle(driveAtlasApi, [
        { ad: ATLAS_PNG, mime: 'image/png', bytes: secim.png },
        { ad: ATLAS_JSON, mime: 'application/json', bytes: secim.json }
      ]);
      durum.textContent = r.tamam ? 'Yüklendi ve Drive\'dan geri okunan dosyalar aynı.' : 'Yüklendi, ama geri okunan dosya farklı. Tekrar yükle.';
      durum.classList.toggle('hata', !r.tamam);
      sonucGoster(r);
    } catch (e) {
      durum.textContent = hata(e);
      durum.classList.add('hata');
    }
    calisiyor = false; kilitle();
  };

  function sonucGoster(r: AtlasYuklemeSonucu): void {
    const satir = (...h: string[]) => el('tr', {}, ...h.map(x => el('td', {}, x)));
    const tablo = el('table', {},
      el('tr', {}, ...['Dosya', 'İşlem', 'Boyut', 'Drive\'daki', 'SHA-256 (ilk 16)', 'Aynı mı'].map(x => el('th', {}, x))),
      ...r.dosyalar.map(d => satir(d.ad, d.islem === 'olusturuldu' ? 'oluşturuldu' : 'güncellendi', String(d.boyut), String(d.driveBoyut),
        d.sha256.slice(0, 16) + (d.sha256 === d.driveSha256 ? '' : ` ≠ ${d.driveSha256.slice(0, 16)}`), d.esit ? 'evet' : 'HAYIR')));
    const metin = [
      `kök: ${r.kok}/${SISTEM_KLASORU}/${EL_YAZISI_KLASORU}/ (klasör id ${r.klasorId})`,
      ...r.dosyalar.map(d => `${d.ad}: ${d.islem}, ${d.boyut} B, Drive ${d.driveBoyut} B, sha256 ${d.sha256}, aynı: ${d.esit ? 'evet' : 'HAYIR'}`),
      ...r.uyarilar.map(u => `uyarı: ${u}`)
    ].join('\n');
    const kopyala = el('button', {}, 'Kopyala');
    kopyala.onclick = () => void navigator.clipboard.writeText(metin).then(() => { kopyala.textContent = 'Kopyalandı'; });
    sonucKutu.append(tablo, ...r.uyarilar.map(u => el('p', { class: 'not' }, `Uyarı: ${u}`)), el('pre', {}, metin), kopyala);
  }
}
