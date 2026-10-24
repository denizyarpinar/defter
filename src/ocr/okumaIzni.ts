// Task 6.4c-4: may this account read handwriting? GET /api/oku → { acik } (owner + key; free, no Anthropic
// request). Reading only when the user asks (Deniz's decision); the buttons are shown only with acik: true.
// No answer (vite dev without "vercel dev": HTML), 404 or a network error → false. The answer is kept per
// token (another account, a new token → asked again); a failure is not kept.

export async function okumaDurumu(o: { token: string | null; fetch?: typeof fetch }): Promise<boolean | null> {
  if (!o.token) return false;
  let r: Response;
  try {
    r = await (o.fetch ?? fetch)('/api/oku', { headers: { Authorization: `Bearer ${o.token}` } });
  } catch { return null; }
  if (r.status === 404) return false;
  if (!r.ok) return null;
  try {
    const g = await r.json() as { acik?: unknown };
    return g.acik === true;
  } catch { return false; }
}

export class OkumaIzni {
  private token: string | null = null;
  private bilinen: boolean | null = null;
  private suren: { token: string; p: Promise<boolean> } | null = null;

  constructor(private readonly o: { token: () => string | null; fetch?: typeof fetch }) {}

  // The known answer for the current token; unknown → false
  simdi(): boolean {
    const t = this.o.token();
    return !!t && t === this.token && this.bilinen === true;
  }

  acik(): Promise<boolean> {
    const t = this.o.token();
    if (!t) return Promise.resolve(false);
    if (t === this.token && this.bilinen !== null) return Promise.resolve(this.bilinen);
    if (this.suren?.token === t) return this.suren.p;
    const p = okumaDurumu({ token: t, fetch: this.o.fetch }).then(a => {
      if (this.suren?.token === t) this.suren = null;
      if (a === null) return false;
      this.token = t; this.bilinen = a;
      return a;
    });
    this.suren = { token: t, p };
    return p;
  }
}

// The "El yazısını oku" button: a Drive library (not the sample), a PDF page open, the pen closed, acik: true
export function okumaGorunur(d: { ornek: boolean; acik: boolean; pdfVar: boolean; kalemAcik: boolean }): boolean {
  return !d.ornek && d.acik && d.pdfVar && !d.kalemAcik;
}
