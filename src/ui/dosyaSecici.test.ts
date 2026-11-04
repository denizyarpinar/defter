import { describe, expect, it, vi } from 'vitest';
import { openFilePicker } from './dosyaSecici';
import { DOSYA_ACCEPT } from '../defter/dosyaTuru';

describe('A2 aynı dosya seçicisi', () => {
  it('yalnız kullanıcı çağrısında PDF filtresi ve tek seçim uygular', () => {
    const input = { accept: '', multiple: true, value: 'old', click: vi.fn() };
    openFilePicker(input, true);
    expect(input.accept).toBe('.pdf,application/pdf'); expect(input.multiple).toBe(false);
    expect(input.value).toBe(''); expect(input.click).toHaveBeenCalledOnce();
  });
  it('PDF iptalinden sonra genel açılış resim/Office ve çoklu seçimi geri getirir', () => {
    const input = { accept: '', multiple: true, value: '', click: vi.fn() };
    openFilePicker(input, true); openFilePicker(input, false);
    expect(input.accept).toBe(DOSYA_ACCEPT); expect(input.multiple).toBe(true);
    expect(input.accept).toContain('.docx'); expect(input.accept).toContain('image/jpeg');
  });
  it('aynı dosya tekrar seçilebilir; genel → PDF geçişi de ayarlanır', () => {
    const input = { accept: DOSYA_ACCEPT, multiple: true, value: 'same.pdf', click: vi.fn() };
    openFilePicker(input, false); input.value = 'same.pdf'; openFilePicker(input, true);
    expect(input.value).toBe(''); expect(input.multiple).toBe(false);
  });
});
