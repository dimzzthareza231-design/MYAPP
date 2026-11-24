// Buang pengenal pasien dari teks sebelum dikirim ke layanan luar (Google Search/Maps grounding).
export function scrubPhi(value: unknown, maxLength = 2000): string {
  return String(value ?? '')
    .slice(0, maxLength)
    .replace(/RM-\d{6}-\d{3,6}/gi, '[RM]')
    .replace(/\b\d{16}\b/g, '[NIK]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
    .replace(/(?:\+62|0)[\d\s().-]{8,}\d/g, '[TELEPON]');
}
