import { randomInt } from 'node:crypto';

// No. RM: RM-YYMMDD-XXXX. Urutan XXXX acak dan dicek ke store, bukan length+1: beberapa isolate
// Workers punya salinan store sendiri, jadi counter berbasis length bisa kembar di dua isolate.
export function nextRmNumber(existing: Array<{ no_rm: string }>, now = new Date()): string {
  const day = now.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }).slice(2).replace(/-/g, '');
  const used = new Set(existing.map((p) => p.no_rm));
  for (let i = 0; i < 50; i++) {
    const candidate = `RM-${day}-${String(randomInt(1, 10000)).padStart(4, '0')}`;
    if (!used.has(candidate)) return candidate;
  }
  return `RM-${day}-${Date.now().toString().slice(-6)}`;
}
