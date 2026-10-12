import './styles.css';
import { SAMPLE_ROOM, SAMPLE_SHELVES } from './model/sampleData';
import { createRoomScene, type RoomScene, type View } from './scene';
import { updateHint } from './ui/hint';
import { initTopBar, updateCrumb, updateModeButtons, type LightMode } from './ui/topBar';
import { toast } from './ui/toast';

const app = document.querySelector<HTMLElement>('#app')!;
const stageEl = document.querySelector<HTMLElement>('#stage')!;

// Light mode is kept in memory for now; later it will be saved in kitaplik.json (oda.mod).
let mode: LightMode = location.hash === '#aksam' ? 'night' : 'auto';
let scene: RoomScene | null = null;

const isEvening = () => { const h = new Date().getHours(); return h >= 18 || h < 6; };
const effectiveMode = (): 'day' | 'night' => mode === 'auto' ? (isEvening() ? 'night' : 'day') : mode;

function applyMode(instant = false): void {
  const m = effectiveMode();
  const changed = app.dataset.mode !== m;
  app.dataset.mode = m;
  document.body.style.background = m === 'night' ? '#0e1527' : '#d8c3a2';
  updateModeButtons(mode);
  if (scene && (changed || instant)) scene.setNight(m === 'night', instant);
}

function onViewChange(v: View): void {
  app.dataset.view = v;
  updateCrumb(v);
  updateHint(v);
}

initTopBar({
  onModeChange: m => {
    mode = m;
    applyMode();
    if (m === 'auto') toast(isEvening() ? 'Otomatik: saat 18:00\'i geçti, oda akşam modunda.' : 'Otomatik: oda 18:00\'de akşam moduna geçecek.');
  },
  onGoRoom: () => scene?.setView('room')
});

async function boot(): Promise<void> {
  applyMode(true);
  // canvas textures draw text, so wait for the fonts (max 2.5 s)
  try {
    await Promise.race([
      Promise.all([document.fonts.load('700 20px Figtree'), document.fonts.load('600 20px "Cormorant Garamond"', 'AZ ÂÜİĞŞÇÖ'), document.fonts.load('700 20px "Cormorant Garamond"', 'AZ ÂÜİĞŞÇÖ')]),
      new Promise(r => setTimeout(r, 2500))
    ]);
  } catch { /* fonts are optional */ }

  scene = createRoomScene(stageEl, {
    shelves: SAMPLE_SHELVES,
    room: SAMPLE_ROOM,
    night: effectiveMode() === 'night',
    onViewChange
  });

  // clock + automatic evening switch
  setInterval(() => { scene?.updateClock(); if (mode === 'auto') applyMode(); }, 20000);

  let rt: number | undefined;
  addEventListener('resize', () => { clearTimeout(rt); rt = window.setTimeout(() => scene?.resize(), 120); });

  document.querySelector<HTMLElement>('#loading')!.hidden = true;
}

boot();
