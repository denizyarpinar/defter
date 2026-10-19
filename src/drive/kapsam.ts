// Task 6.K1: which Google permission (scope) to ask for. Pure (no DOM, no GIS), tested.
// - Everyone gets drive.file (only the files the app created or opened). The owner gets the full drive scope.
// - The owner is the e-mail in VITE_SAHIP_EPOSTA; without it there is no owner mode. This is not security,
//   it only picks the permission to ask for.
// - Test switches: ?kapsam=dar (ask only drive.file, without the scopes granted before), ?sahip=0 (not the owner).

export const KAPSAM_TAM = 'https://www.googleapis.com/auth/drive';
export const KAPSAM_DAR = 'https://www.googleapis.com/auth/drive.file';

export type AktifKapsam = 'tam' | 'dar';

export const darZorlaUrl = (search: string): boolean => new URLSearchParams(search).get('kapsam') === 'dar';
export const sahipZorlaYok = (search: string): boolean => new URLSearchParams(search).get('sahip') === '0';

const esit = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function sahipMi(eposta: string | undefined, sahipEposta: string | undefined, sahipYok = false): boolean {
  return !sahipYok && !!eposta?.trim() && !!sahipEposta?.trim() && esit(eposta, sahipEposta);
}

// On the sign-in tap: the remembered account is the owner's → full drive, else drive.file.
export function girisKapsami(o: { sahipEposta?: string; hatirlananEposta?: string; darZorla: boolean; sahipYok: boolean }): AktifKapsam {
  return !o.darZorla && sahipMi(o.hatirlananEposta, o.sahipEposta, o.sahipYok) ? 'tam' : 'dar';
}

// ?kapsam=dar: only what is asked now, not what was granted before (to try the narrow mode with one's own account)
export const includeGranted = (darZorla: boolean): boolean => !darZorla;

// The token's scope list (space separated) → the mode it allows; neither scope: null (unusable token)
export function kapsamOku(scope: string | undefined): AktifKapsam | null {
  const s = (scope ?? '').split(/\s+/);
  return s.includes(KAPSAM_TAM) ? 'tam' : s.includes(KAPSAM_DAR) ? 'dar' : null;
}

// The owner signed in with drive.file only: offer "Tam erişimi aç" (instead of the "not found" card)
export const tamErisimDugmesi = (o: { sahip: boolean; aktif: AktifKapsam | null }): boolean => o.sahip && o.aktif === 'dar';

// For the ?olcum=1 box: "drive, drive.file, …" without the URL prefix
export const kisaScope = (s: string): string => s.replace('https://www.googleapis.com/auth/', '');
