import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';
import { mixHex, mulberry } from './units';

type Draw = (g: CanvasRenderingContext2D, w: number, h: number) => void;

let maxAnisotropy = 1;
export function setMaxAnisotropy(n: number): void {
  maxAnisotropy = n;
}

export function canvas(w: number, h: number, draw: Draw): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  return c;
}

export function tex(c: HTMLCanvasElement, rep?: [number, number], srgb = true): CanvasTexture {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  t.anisotropy = Math.min(8, maxAnisotropy);
  if (rep) { t.wrapS = t.wrapT = RepeatWrapping; t.repeat.set(rep[0], rep[1]); }
  return t;
}

export function noise(g: CanvasRenderingContext2D, w: number, h: number, amt: number, seed?: number): void {
  const r = mulberry(seed || 5), id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - .5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(id, 0, 0);
}

export function drawWood(g: CanvasRenderingContext2D, w: number, h: number, base: string, dark: string, seed: number, lines?: number): void {
  const r = mulberry(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < (lines || 160); i++) {
    const y0 = r() * h, amp = 1.5 + r() * 7, fr = (0.6 + r() * 2.4) * Math.PI * 2 / w, ph = r() * 6;
    g.strokeStyle = dark; g.globalAlpha = 0.035 + r() * 0.11; g.lineWidth = 0.5 + r() * 2.2;
    g.beginPath();
    for (let x = 0; x <= w; x += 6) {
      const y = y0 + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 3.3 + ph * 2) * amp * .25;
      if (x) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.stroke();
  }
  // a few knots
  for (let k = 0; k < 3; k++) {
    const cx = r() * w, cy = r() * h;
    g.globalAlpha = .12; g.fillStyle = dark;
    g.beginPath(); g.ellipse(cx, cy, 10 + r() * 14, 3 + r() * 4, 0, 0, 7); g.fill();
  }
  g.globalAlpha = 1; noise(g, w, h, 12, seed + 1);
}

const cache: Record<string, Texture> = {};

export type WoodKind = 'walnut' | 'oak' | 'light';
const WOOD_PALETTE: Record<WoodKind, [string, string]> = {
  walnut: ['#6b3f2a', '#2b140b'], oak: ['#d9bd96', '#8a6038'], light: ['#efe6d8', '#b49a78']
};

export function woodTex(kind: WoodKind, rot?: boolean): Texture {
  const key = kind + (rot ? 'v' : 'h');
  if (cache[key]) return cache[key];
  const pal = WOOD_PALETTE[kind];
  const t = tex(canvas(1024, 1024, (g, w, h) => drawWood(g, w, h, pal[0], pal[1], kind.length * 7)), [1, 1]);
  if (rot) { t.center.set(.5, .5); t.rotation = Math.PI / 2; }
  return cache[key] = t;
}

export function floorTex(a: string, b: string): Texture {
  return tex(canvas(1024, 1024, (g, w, h) => {
    const r = mulberry(11), rows = 7, ph = h / rows;
    for (let i = 0; i < rows; i++) {
      let x = -r() * w * 0.6;
      while (x < w) {
        const L = w * (0.42 + r() * 0.5);
        g.fillStyle = mixHex(a, b, r()); g.fillRect(x, i * ph, L, ph);
        for (let k = 0; k < 22; k++) {
          g.strokeStyle = `rgba(70,35,10,${0.04 + r() * 0.09})`; g.lineWidth = 0.5 + r() * 1.4;
          const yy = i * ph + 3 + r() * (ph - 6), f = 0.006 + r() * 0.02, p2 = r() * 6;
          g.beginPath();
          for (let xx = Math.max(x, 0); xx < Math.min(x + L, w); xx += 8) g.lineTo(xx, yy + Math.sin(xx * f + p2) * 2.2);
          g.stroke();
        }
        g.fillStyle = 'rgba(45,22,6,.45)'; g.fillRect(x + L - 2, i * ph, 2, ph);
        x += L;
      }
      g.fillStyle = 'rgba(45,22,6,.38)'; g.fillRect(0, i * ph, w, 2);
    }
    noise(g, w, h, 10, 12);
  }), [2.2, 2.2]);
}

export function plasterTex(): Texture {
  if (cache.plaster) return cache.plaster;
  return cache.plaster = tex(canvas(512, 512, (g, w, h) => {
    g.fillStyle = '#f4f2ee'; g.fillRect(0, 0, w, h);
    const r = mulberry(3);
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(${r() < .5 ? 255 : 200},${r() < .5 ? 250 : 195},${r() < .5 ? 245 : 190},.05)`;
      g.beginPath(); g.arc(r() * w, r() * h, 20 + r() * 70, 0, 7); g.fill();
    }
    noise(g, w, h, 7, 4);
  }), [4, 3]);
}

export function clothNoise(seed: number): Texture {
  const key = 'cloth' + seed;
  if (cache[key]) return cache[key];
  return cache[key] = tex(canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.globalAlpha = .07; g.fillStyle = '#000';
    for (let y = 0; y < h; y += 2) g.fillRect(0, y, w, 1);
    for (let x = 0; x < w; x += 2) g.fillRect(x, 0, 1, h);
    g.globalAlpha = 1; noise(g, w, h, 22, seed);
  }), [2, 2]);
}

export function pagesTex(): Texture {
  return tex(canvas(256, 256, (g, w, h) => {
    g.fillStyle = '#f4ecdb'; g.fillRect(0, 0, w, h);
    const r = mulberry(21);
    for (let y = 0; y < h; y += 2) { g.fillStyle = `rgba(120,95,60,${0.05 + r() * 0.12})`; g.fillRect(0, y, w, 1); }
  }), [1, 1]);
}

export interface Sky {
  texture: CanvasTexture;
  // k: 0 = day, 1 = evening. morning = evening → day (moon sets, sun rises).
  draw(k: number, morning?: boolean): void;
}

type RGB = [number, number, number];
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpRgb = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c: RGB, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
// 0 → 1 while t goes from a to b
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));

// sky gradient stops at 0, .75 and 1 (top → horizon)
const SKY_DAY: RGB[] = [[0x9e, 0xc9, 0xec], [0xdc, 0xeb, 0xf4], [0xf3, 0xea, 0xd8]];
const SKY_DUSK: RGB[] = [[0x3a, 0x4a, 0x7c], [0xe9, 0x9a, 0x78], [0xf7, 0xc8, 0x82]];
const SKY_NIGHT: RGB[] = [[0x0a, 0x12, 0x28], lerpRgb([0x0a, 0x12, 0x28], [0x26, 0x36, 0x5c], .75), [0x26, 0x36, 0x5c]];
const HILL_DAY: RGB = [120, 150, 120], HILL_DUSK: RGB = [62, 58, 78], HILL_NIGHT: RGB = [24, 32, 58];

// Window sky. The end frames (k = 0 and 1) are the prototype's day and night skies.
export function createSky(): Sky {
  const w = 512, h = 640;
  // fixed layers, drawn once with the prototype's random seeds
  const rDay = mulberry(4);
  const clouds = canvas(w, h, g => {
    for (let i = 0; i < 5; i++) {
      const cx = rDay() * w, cy = h * (.15 + rDay() * .35);
      for (let k = 0; k < 7; k++) {
        g.fillStyle = 'rgba(255,255,255,.55)';
        g.beginPath(); g.ellipse(cx + (rDay() - .5) * 90, cy + (rDay() - .5) * 16, 30 + rDay() * 40, 12 + rDay() * 10, 0, 0, 7); g.fill();
      }
    }
  });
  const hills: [number, number][] = [];
  for (let x = 0; x <= w; x += 16) hills.push([x, h * .84 - Math.abs(Math.sin(x * .05)) * 30 - rDay() * 10]);
  const rNight = mulberry(9);
  const stars = canvas(w, h, g => {
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,255,255,${0.3 + rNight() * 0.7})`;
      g.beginPath(); g.arc(rNight() * w, rNight() * h * .7, rNight() * 1.4 + .3, 0, 7); g.fill();
    }
  });

  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  const texture = tex(c);

  const glowDisc = (x: number, y: number, core: string, mid: string, haze: string, edge: string) => {
    const gr = g.createRadialGradient(x, y, 4, x, y, 70);
    gr.addColorStop(0, core); gr.addColorStop(.32, mid); gr.addColorStop(.36, haze); gr.addColorStop(1, edge);
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  };

  // Sun and moon travel on arcs around a point behind the hills: they rise on the left
  // and set on the right. Angle 180° = left horizon, 90° = top, 0° = right horizon.
  const cx = w * .5, cy = h * .9;
  const onArc = (rx: number, ry: number, deg: number): [number, number] => {
    const a = deg * Math.PI / 180;
    return [cx + Math.cos(a) * rx, cy - Math.sin(a) * ry];
  };
  // sun: high above the window by day (90°, out of view)
  const SUN_RX = 230, SUN_RY = 640;
  // moon: ends exactly at the prototype's night position (w·.68, h·.28)
  const MOON_RX = 200;
  const moonCos = (w * .68 - cx) / MOON_RX;
  const MOON_DEG = Math.acos(moonCos) * 180 / Math.PI;
  const MOON_RY = (cy - h * .28) / Math.sqrt(1 - moonCos * moonCos);
  const smooth = (t: number) => t * t * (3 - 2 * t);

  // k: 0 = day, 1 = evening. morning = going from evening to day (moon sets, sun rises).
  const draw = (k: number, morning = false) => {
    // sky colour: day → dusk (k = .5) → night
    const stops = k < .5
      ? SKY_DAY.map((d, i) => lerpRgb(d, SKY_DUSK[i], k * 2))
      : SKY_DUSK.map((d, i) => lerpRgb(d, SKY_NIGHT[i], (k - .5) * 2));
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, rgba(stops[0])); gr.addColorStop(.75, rgba(stops[1])); gr.addColorStop(1, rgba(stops[2]));
    g.globalAlpha = 1; g.fillStyle = gr; g.fillRect(0, 0, w, h);

    // warm glow over the horizon on the side where the sun is
    const dusk = Math.sin(Math.PI * clamp01(k * 1.25));
    if (dusk > 0.01) {
      const gx = morning ? w * .2 : w * .8;
      const hg = g.createRadialGradient(gx, h * .86, 10, gx, h * .86, w * .9);
      hg.addColorStop(0, `rgba(255,170,95,${.55 * dusk})`); hg.addColorStop(1, 'rgba(255,170,95,0)');
      g.fillStyle = hg; g.fillRect(0, 0, w, h);
    }

    const starA = ramp(k, .55, 1);
    if (starA > 0) { g.globalAlpha = starA; g.drawImage(stars, 0, 0); g.globalAlpha = 1; }

    // progress of the setting body and of the rising body (they move at the same time)
    const t = morning ? 1 - k : k;
    const setT = smooth(ramp(t, 0, .7)), riseT = smooth(ramp(t, .3, 1));

    // sun: evening 90° → 0° (sets right), morning 180° → 90° (rises left)
    const sunDeg = morning ? lerp(180, 90, riseT) : lerp(90, 0, setT);
    const sunShown = morning ? riseT > 0 && riseT < 1 : setT > 0 && setT < 1;
    if (sunShown) {
      const [sx, sy] = onArc(SUN_RX, SUN_RY, sunDeg);
      const low = 1 - Math.sin(sunDeg * Math.PI / 180);   // 0 high, 1 at the horizon
      const sun = lerpRgb([255, 246, 214], [255, 150, 70], clamp01(low * 1.6));
      glowDisc(sx, sy, rgba(sun), rgba(sun), rgba(sun, .3), rgba(sun, 0));
    }

    // moon: evening 180° → night place (rises left), morning night place → 0° (sets right)
    const moonDeg = morning ? lerp(MOON_DEG, 0, setT) : lerp(180, MOON_DEG, riseT);
    const moonShown = morning ? setT < 1 : riseT > 0;
    if (moonShown) {
      const [mx, my] = onArc(MOON_RX, MOON_RY, moonDeg);
      glowDisc(mx, my, 'rgba(255,248,225,1)', 'rgba(250,240,210,1)', 'rgba(250,240,210,.25)', 'rgba(250,240,210,0)');
    }

    const cloudA = 1 - ramp(k, 0, .7);
    if (cloudA > 0) { g.globalAlpha = cloudA; g.drawImage(clouds, 0, 0); g.globalAlpha = 1; }

    // hills: green by day, dark silhouette at dusk, gone at night (as in the prototype)
    const hillC = k < .5 ? lerpRgb(HILL_DAY, HILL_DUSK, k * 2) : lerpRgb(HILL_DUSK, HILL_NIGHT, (k - .5) * 2);
    const hillA = lerp(.55, .97, ramp(k, 0, .45)) * (1 - ramp(k, .8, 1));
    if (hillA > 0) {
      g.fillStyle = rgba(hillC, hillA);
      g.beginPath(); g.moveTo(0, h * .86);
      for (const [x, y] of hills) g.lineTo(x, y);
      g.lineTo(w, h); g.lineTo(0, h); g.fill();
    }
    texture.needsUpdate = true;
  };

  draw(0);
  return { texture, draw };
}

export function abstractCanvas(): HTMLCanvasElement {
  return canvas(600, 416, (g, w, h) => {
    g.fillStyle = '#f4ede2'; g.fillRect(0, 0, w, h);
    // three arches
    const arch = (x: number, aw: number, top: number, col: string) => {
      g.fillStyle = col;
      g.beginPath(); g.moveTo(x, h); g.lineTo(x, top + aw / 2); g.arc(x + aw / 2, top + aw / 2, aw / 2, Math.PI, 0); g.lineTo(x + aw, h); g.fill();
    };
    arch(48, 150, 120, '#d9b48c');
    arch(228, 150, 70, '#2f4a63');
    arch(408, 150, 150, '#b5523b');
    // sun and a thin horizon line
    g.fillStyle = '#e8c56a'; g.beginPath(); g.arc(303, 118, 42, 0, 7); g.fill();
    g.fillStyle = '#2a231d'; g.fillRect(30, h - 70, w - 60, 3);
    // soft hills in front
    g.fillStyle = '#7b8f78'; g.beginPath(); g.moveTo(0, h - 40); g.quadraticCurveTo(w * .3, h - 110, w * .62, h - 52); g.quadraticCurveTo(w * .85, h - 20, w, h - 60); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    noise(g, w, h, 8, 2);
  });
}

export function artCanvas(): HTMLCanvasElement {
  return canvas(288, 384, (g, w, h) => {
    g.fillStyle = '#efe7da'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#c9925f'; g.beginPath(); g.arc(w * .62, h * .36, w * .24, 0, 7); g.fill();
    g.fillStyle = '#2f4a63'; g.beginPath(); g.moveTo(0, h * .78); g.quadraticCurveTo(w * .4, h * .58, w, h * .72); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    g.fillStyle = '#7b8f78'; g.beginPath(); g.moveTo(0, h * .86); g.quadraticCurveTo(w * .6, h * .72, w, h * .9); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    noise(g, w, h, 10, 6);
  });
}

export interface PlateMaps {
  map: Texture;
  bumpMap: Texture;
}

// Brushed brass name plate (86×14 cm) with engraved, black-filled serif letters and two screws.
// Same layout drawn twice: colour map + bump map (dark = engraved deeper).
export const PLATE_W = 0.86, PLATE_H = 0.14;
export function plateTex(text: string): PlateMaps {
  const w = 1024, h = Math.round(w * PLATE_H / PLATE_W), label = text.toLocaleUpperCase('tr-TR');
  const sr = 9, screwX = [26, w - 26], cy = h / 2;

  // big, bold letters that fill the plate; shrink only if the name is long
  const fit = (g: CanvasRenderingContext2D) => {
    let fs = 116;
    const set = () => {
      g.font = `700 ${fs}px "Cormorant Garamond", Georgia, serif`;
      g.letterSpacing = `${Math.round(fs * .05)}px`;
    };
    set();
    while (g.measureText(label).width > w - 110 && fs > 40) { fs -= 2; set(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
  };
  const ty = cy + 8;   // optical centre for caps

  const screw = (g: CanvasRenderingContext2D, x: number, face: boolean) => {
    if (face) {
      const sg = g.createRadialGradient(x - 2, cy - 2, 1, x, cy, sr);
      sg.addColorStop(0, '#f6e6b4'); sg.addColorStop(.6, '#b8914c'); sg.addColorStop(1, '#6e5124');
      g.fillStyle = sg;
    } else g.fillStyle = '#ddd';
    g.beginPath(); g.arc(x, cy, sr, 0, 7); g.fill();
    g.strokeStyle = face ? 'rgba(50,32,8,.85)' : '#000'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(x - 6, cy + 3); g.lineTo(x + 6, cy - 3); g.stroke();
  };

  const color = canvas(w, h, g => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#efd99c'); gr.addColorStop(.5, '#d2ae66'); gr.addColorStop(1, '#ad8641');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // brushed metal: fine horizontal streaks (subtle, so they don't fight the letters)
    const r = mulberry(17);
    for (let i = 0; i < 360; i++) {
      g.fillStyle = r() < .5 ? `rgba(255,244,210,${r() * .12})` : `rgba(90,60,20,${r() * .08})`;
      g.fillRect(r() * w - 200, r() * h, 120 + r() * 500, 1);
    }
    // bevelled edge: light top/left, dark bottom/right
    g.fillStyle = 'rgba(255,246,220,.6)'; g.fillRect(0, 0, w, 4); g.fillRect(0, 0, 4, h);
    g.fillStyle = 'rgba(70,45,10,.6)'; g.fillRect(0, h - 4, w, 4); g.fillRect(w - 4, 0, 4, h);
    for (const x of screwX) screw(g, x, true);
    // engraved letters filled with black paint: light lip below, dark fill on top
    fit(g);
    g.fillStyle = 'rgba(255,244,210,.8)'; g.fillText(label, w / 2, ty + 3);
    g.fillStyle = '#17100a'; g.fillText(label, w / 2, ty);
  });

  const bump = canvas(w, h, g => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    for (const x of screwX) screw(g, x, false);
    fit(g);
    g.fillStyle = '#000'; g.fillText(label, w / 2, ty);
  });

  return { map: tex(color), bumpMap: tex(bump, undefined, false) };
}
