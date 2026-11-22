// Utilitas kripto berbasis Web Crypto (tersedia di Node >= 20 dan Cloudflare Workers).

const encoder = new TextEncoder();

/** Perbandingan string waktu-konstan: membandingkan digest SHA-256 kedua nilai (panjang selalu sama). */
export async function timingSafeEqualString(a: string, b: string): Promise<boolean> {
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(a)),
    crypto.subtle.digest('SHA-256', encoder.encode(b))
  ]);
  const va = new Uint8Array(da);
  const vb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < va.length; i += 1) diff |= va[i] ^ vb[i];
  return diff === 0 && a.length === b.length;
}

export function randomId(prefix: string): string {
  return `${prefix}${crypto.randomUUID().replace(/-/g, '')}`;
}

export function basicAuth(user: string, password: string): string {
  const bytes = encoder.encode(`${user}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}
