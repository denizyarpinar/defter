import { DOSYA_ACCEPT } from '../defter/dosyaTuru';

// Reset on every user action: cancelling a PDF picker must not restrict the general picker.
export function openFilePicker(input: Pick<HTMLInputElement, 'accept' | 'multiple' | 'value' | 'click'>, pdfOnly: boolean): void {
  input.accept = pdfOnly ? '.pdf,application/pdf' : DOSYA_ACCEPT;
  input.multiple = !pdfOnly;
  input.value = '';
  input.click();
}
