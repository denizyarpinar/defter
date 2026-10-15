import { describe, expect, it } from 'vitest';
import { qv } from './drive';

describe('qv (value inside a Drive query)', () => {
  it("escapes the single quote", () => {
    expect(qv("Deniz'in notları.pdf")).toBe("Deniz\\'in notları.pdf");
  });
  it('escapes the backslash first', () => {
    expect(qv("a\\'b")).toBe("a\\\\\\'b");
  });
  it('leaves other names unchanged', () => {
    expect(qv('defter/1. hafta.jpg')).toBe('defter/1. hafta.jpg');
  });
});
