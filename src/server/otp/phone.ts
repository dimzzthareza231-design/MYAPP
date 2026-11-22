// Normalisasi nomor ponsel Indonesia ke E.164 tanpa tanda "+" (format yang diterima WhatsApp Cloud API).
// Contoh: "0812-3456-7890" / "+62 812 3456 7890" / "8123456789" -> "6281234567890".

/** Mengembalikan nomor E.164 (tanpa "+") atau null bila bukan nomor ponsel Indonesia yang wajar. */
export function normalizeIndonesianPhone(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > 40) return null;
  // Hanya digit, spasi, tanda hubung, titik, kurung, dan "+" di depan yang diterima.
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return null;
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith('0062')) digits = digits.slice(2);
  if (digits.startsWith('62')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  // Nomor seluler Indonesia: diawali 8, total 9-12 digit setelah kode negara.
  if (!/^8\d{8,11}$/.test(digits)) return null;
  return `62${digits}`;
}

/** Menyamarkan nomor menjadi format lokal, mis. "08******123". */
export function maskPhone(e164: string): string {
  const local = e164.startsWith('62') ? `0${e164.slice(2)}` : e164;
  if (local.length < 6) return '*'.repeat(local.length);
  return `${local.slice(0, 2)}${'*'.repeat(local.length - 5)}${local.slice(-3)}`;
}
