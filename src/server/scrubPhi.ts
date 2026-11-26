// Buang pengenal pasien dari teks sebelum dikirim ke layanan luar (Google Search/Maps grounding).
export function scrubPhi(value: unknown, maxLength = 2000): string {
  return String(value ?? '')
    .slice(0, maxLength)
    .replace(/(["']?(?:patient_?name|nama_?pasien|no_?rm|medical_?record(?:_?number)?|nik|no_?sep|sep_?no|phone|no_?hp|email|address|alamat|tanggal_?lahir|birth_?date|dob)["']?\s*:\s*["'])[^"']*(["'])/gi, '$1[IDENTITAS]$2')
    .replace(/\b((?:nama(?:\s+pasien)?|patient\s+name|pasien|no\.?\s*rm|medical\s+record(?:\s+number)?|nik|no\.?\s*sep|sep\s+number))\s*[:=]\s*[^,\n;]+/gi, '$1: [IDENTITAS]')
    .replace(/RM-\d{6}-\d{3,6}/gi, '[RM]')
    .replace(/\b\d{16}\b/g, '[NIK]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[EMAIL]')
    .replace(/(?:\+62|0)[\d\s().-]{8,}\d/g, '[TELEPON]');
}

const PRIVATE_FIELD = /^(?:name|nama|nama_?pasien|patient_?name|patient_?id|no_?rm|medical_?record(?:_?number)?|nik|no_?sep|sep_?no|no_?kartu|phone|no_?hp|email|address|alamat|tanggal_?lahir|birth_?date|dob)$/i;

export function scrubPhiData(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubPhiData);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).filter(([key]) => !PRIVATE_FIELD.test(key)).map(([key, item]) => [key, scrubPhiData(item)])
    );
  }
  return typeof value === 'string' ? scrubPhi(value, 8000) : value;
}

export function safeErrorDetails(error: unknown): { type: string; message: string } {
  const details = error && typeof error === 'object'
    ? error as { type?: unknown; message?: unknown; name?: unknown }
    : {};
  return {
    type: typeof details.type === 'string'
      ? details.type
      : typeof details.name === 'string' ? details.name : 'unknown',
    message: scrubPhi(typeof details.message === 'string' ? details.message : 'Unexpected error.', 8000)
  };
}
