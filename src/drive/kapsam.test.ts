import { describe, expect, it } from 'vitest';
import { darZorlaUrl, girisKapsami, includeGranted, kapsamOku, KAPSAM_DAR, KAPSAM_TAM, kisaScope, sahipMi, sahipZorlaYok, tamErisimDugmesi } from './kapsam';

const SAHIP = 'sahip@example.com';
const giris = (o: Partial<Parameters<typeof girisKapsami>[0]>) => girisKapsami({ darZorla: false, sahipYok: false, ...o });

describe('girisKapsami: which permission the sign-in tap asks for', () => {
  it('the remembered account is the owner → full drive', () => {
    expect(giris({ sahipEposta: SAHIP, hatirlananEposta: SAHIP })).toBe('tam');
  });

  it('e-mail compared without case and spaces', () => {
    expect(giris({ sahipEposta: ' Sahip@Example.com ', hatirlananEposta: 'sahip@example.COM' })).toBe('tam');
  });

  it('someone else → drive.file', () => {
    expect(giris({ sahipEposta: SAHIP, hatirlananEposta: 'baska@example.com' })).toBe('dar');
  });

  it('no remembered e-mail (first visit, signed out, other account) → drive.file', () => {
    expect(giris({ sahipEposta: SAHIP })).toBe('dar');
    expect(giris({ sahipEposta: SAHIP, hatirlananEposta: '' })).toBe('dar');
  });

  it('no VITE_SAHIP_EPOSTA → no owner mode, everyone drive.file', () => {
    expect(giris({ hatirlananEposta: SAHIP })).toBe('dar');
    expect(giris({ sahipEposta: '', hatirlananEposta: '' })).toBe('dar');
  });

  it('?kapsam=dar → drive.file even for the owner', () => {
    expect(giris({ sahipEposta: SAHIP, hatirlananEposta: SAHIP, darZorla: true })).toBe('dar');
  });

  it('?sahip=0 → treated as not the owner', () => {
    expect(giris({ sahipEposta: SAHIP, hatirlananEposta: SAHIP, sahipYok: true })).toBe('dar');
  });
});

describe('URL switches', () => {
  it('?kapsam=dar', () => {
    expect(darZorlaUrl('?kapsam=dar')).toBe(true);
    expect(darZorlaUrl('?olcum=1&kapsam=dar')).toBe(true);
    expect(darZorlaUrl('?kapsam=tam')).toBe(false);
    expect(darZorlaUrl('')).toBe(false);
  });

  it('?sahip=0', () => {
    expect(sahipZorlaYok('?sahip=0')).toBe(true);
    expect(sahipZorlaYok('?kapsam=dar&sahip=0')).toBe(true);
    expect(sahipZorlaYok('?sahip=1')).toBe(false);
    expect(sahipZorlaYok('')).toBe(false);
  });

  it('include_granted_scopes is off only with ?kapsam=dar', () => {
    expect(includeGranted(false)).toBe(true);
    expect(includeGranted(true)).toBe(false);
  });
});

describe('sahipMi', () => {
  it('owner, someone else, no env, ?sahip=0, no e-mail', () => {
    expect(sahipMi(SAHIP, SAHIP)).toBe(true);
    expect(sahipMi('baska@example.com', SAHIP)).toBe(false);
    expect(sahipMi(SAHIP, undefined)).toBe(false);
    expect(sahipMi(SAHIP, SAHIP, true)).toBe(false);
    expect(sahipMi('', SAHIP)).toBe(false);
    expect(sahipMi(undefined, '')).toBe(false);
  });
});

describe('kapsamOku: the scope list in the token', () => {
  it('full drive (alone or with others) → tam', () => {
    expect(kapsamOku(KAPSAM_TAM)).toBe('tam');
    expect(kapsamOku(`${KAPSAM_DAR} ${KAPSAM_TAM} openid`)).toBe('tam');
  });

  it('only drive.file → dar', () => {
    expect(kapsamOku(`email ${KAPSAM_DAR}`)).toBe('dar');
  });

  it('neither / empty → null', () => {
    expect(kapsamOku('')).toBeNull();
    expect(kapsamOku(undefined)).toBeNull();
    expect(kapsamOku('https://www.googleapis.com/auth/drive.readonly')).toBeNull();
  });

  it('short names for the ?olcum=1 box', () => {
    expect(kisaScope(KAPSAM_DAR)).toBe('drive.file');
  });
});

describe('tamErisimDugmesi: offer "Tam erişimi aç"', () => {
  it('only to the owner with drive.file', () => {
    expect(tamErisimDugmesi({ sahip: true, aktif: 'dar' })).toBe(true);
    expect(tamErisimDugmesi({ sahip: true, aktif: 'tam' })).toBe(false);
    expect(tamErisimDugmesi({ sahip: false, aktif: 'dar' })).toBe(false);
    expect(tamErisimDugmesi({ sahip: true, aktif: null })).toBe(false);
  });
});
