import opencvUrl from '@techstark/opencv-js/dist/opencv.js?url';
import { disbukeyZarf, dortgenPuani, dortKoseyeIndir, koseleriSirala, olcekle, type Kose4, type KoseSonuc, type Nokta } from './kirpHesap';

// Task 5.8b, method A: page corners with OpenCV.js. Development only: the file comes from the
// devDependency through the Vite dev server (no CDN, not in public/, not in the build; where it
// would come from if A is chosen is decided in 5.8c). Loaded lazily, once, on the ?kirpTest=1 page.
// Steps: shrink (A_KENAR) → gray → blur → Canny + dilate → largest 4-corner contour
// (approxPolyDP); else hull of the largest contour → 4 corners; else minAreaRect.

export const A_KENAR = 800;
const ADAY = 5;            // largest contours tried with approxPolyDP
const MIN_GUVEN = 0.3;     // a 4-corner contour below this is skipped

// OpenCV.js has no light type for its runtime object; this page only calls a handful of functions.
type Cv = any;

export interface OpenCvBilgi { cv: Cv; ms: number; bayt: number | null; sikistirilmis: number | null }

let yukleme: Promise<OpenCvBilgi> | null = null;

export function yukleOpenCV(): Promise<OpenCvBilgi> {
  yukleme ??= new Promise<OpenCvBilgi>((resolve, reject) => {
    const t0 = performance.now();
    const script = document.createElement('script');
    script.src = opencvUrl;
    script.async = true;
    script.onerror = () => { yukleme = null; reject(new Error('OpenCV.js yüklenemedi')); };
    script.onload = () => {
      const cv = (window as unknown as { cv?: Cv }).cv;
      if (!cv) { reject(new Error('OpenCV.js yüklendi ama cv bulunamadı')); return; }
      const done = () => {
        const entry = performance.getEntriesByName(script.src)[0] as PerformanceResourceTiming | undefined;
        resolve({ cv, ms: performance.now() - t0, bayt: entry?.decodedBodySize || null, sikistirilmis: entry?.encodedBodySize || null });
      };
      // Module.then calls back with Module itself (a thenable), so it must not be awaited:
      // that would loop forever. Take the callback, then drop .then.
      if (typeof cv.then === 'function') cv.then(() => { delete cv.then; done(); });
      else if (cv.Mat) done();
      else cv.onRuntimeInitialized = done;
    };
    document.head.append(script);
  });
  return yukleme;
}

function noktalar(mat: Cv): Nokta[] {
  const d: Int32Array = mat.data32S;
  const p: Nokta[] = [];
  for (let i = 0; i + 1 < d.length; i += 2) p.push({ x: d[i], y: d[i + 1] });
  return p;
}

function minAreaRectKoseleri(cv: Cv, contour: Cv): Kose4 {
  const r = cv.minAreaRect(contour);
  const a = (r.angle * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  const hw = r.size.width / 2, hh = r.size.height / 2;
  const p = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => ({ x: r.center.x + x * c - y * s, y: r.center.y + x * s + y * c }));
  return koseleriSirala(p);
}

export interface ASonuc { sonuc: KoseSonuc; yol: 'approxPolyDP' | 'zarf' | 'minAreaRect' | null }

export function koseA(cv: Cv, src: HTMLCanvasElement): ASonuc {
  const sc = Math.min(1, A_KENAR / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * sc)), h = Math.max(1, Math.round(src.height * sc));
  const small = document.createElement('canvas');
  small.width = w;
  small.height = h;
  small.getContext('2d')!.drawImage(src, 0, 0, w, h);
  const geri = (k: Kose4) => olcekle(k, src.width / w);

  const mats: Cv[] = [];
  const m = <T>(x: T): T => { mats.push(x); return x; };
  try {
    const rgba = m(cv.imread(small));
    const gray = m(new cv.Mat());
    cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
    const edges = m(new cv.Mat());
    cv.Canny(gray, edges, 50, 150);
    const kernel = m(cv.Mat.ones(3, 3, cv.CV_8U));
    cv.dilate(edges, edges, kernel);
    const contours = m(new cv.MatVector());
    const hier = m(new cv.Mat());
    cv.findContours(edges, contours, hier, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    const list: { i: number; area: number }[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      list.push({ i, area: cv.contourArea(c) });
      c.delete();
    }
    list.sort((a, b) => b.area - a.area);
    if (list.length === 0) return { sonuc: null, yol: null };

    for (const { i } of list.slice(0, ADAY)) {
      const c = m(contours.get(i));
      const approx = m(new cv.Mat());
      cv.approxPolyDP(c, approx, 0.02 * cv.arcLength(c, true), true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const k = koseleriSirala(noktalar(approx));
        const guven = dortgenPuani(k, w, h);
        if (guven >= MIN_GUVEN) return { sonuc: { koseler: geri(k), guven }, yol: 'approxPolyDP' };
      }
    }

    const biggest = m(contours.get(list[0].i));
    const k = dortKoseyeIndir(disbukeyZarf(noktalar(biggest)));
    const guven = k ? dortgenPuani(k, w, h) : 0;
    if (k && guven > 0) return { sonuc: { koseler: geri(k), guven }, yol: 'zarf' };

    const r = minAreaRectKoseleri(cv, biggest);
    const g = dortgenPuani(r, w, h);
    return g > 0 ? { sonuc: { koseler: geri(r), guven: g }, yol: 'minAreaRect' } : { sonuc: null, yol: null };
  } finally {
    for (const x of mats) x.delete();
    small.width = small.height = 0;
  }
}
