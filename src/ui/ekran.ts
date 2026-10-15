// The size of the app's screen in CSS px: the layout viewport.
// Not innerWidth / innerHeight: after a browser page zoom, iPad Safari reports there only the
// zoomed-in part (the visual viewport), and the room was drawn at half size (task 3.7).
export function viewSize(): { w: number; h: number } {
  const d = document.documentElement;
  return { w: d.clientWidth || innerWidth, h: d.clientHeight || innerHeight };
}
