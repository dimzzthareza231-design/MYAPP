// Penomoran antrian poli harian: KODE-NNN, mulai ulang dari 001 setiap hari (tanggal lokal).

export interface KunjunganAntrianLike {
  poli_id?: string | number | null;
  tanggal?: string | null;
  nomor_antrian?: string | null;
}

/** Tanggal kalender lokal (YYYY-MM-DD), bukan UTC: toISOString() bergeser satu hari sebelum pukul 07.00 WIB. */
export function toLocalDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Tanggal kunjungan sebagai YYYY-MM-DD lokal; tanggal tanpa jam dipakai apa adanya. */
export function kunjunganDateKey(tanggal: string | null | undefined): string | null {
  if (!tanggal || typeof tanggal !== 'string') return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) return tanggal;
  const parsed = new Date(tanggal);
  return Number.isNaN(parsed.getTime()) ? null : toLocalDateKey(parsed);
}

/**
 * Nomor antrian berikutnya untuk poli pada hari `now`.
 * Mengambil urutan tertinggi hari itu + 1 (bukan jumlah kunjungan sepanjang masa), sehingga
 * nomor tidak berlanjut dari hari sebelumnya dan tidak bentrok bila ada kunjungan yang dihapus.
 */
export function nextNomorAntrian(
  kunjungan: KunjunganAntrianLike[],
  poliId: string,
  kodePoli: string,
  now: Date = new Date()
): string {
  const todayKey = toLocalDateKey(now);
  let maxSeq = 0;
  let countToday = 0;
  for (const k of kunjungan || []) {
    if (!k || String(k.poli_id ?? '') !== poliId) continue;
    if (kunjunganDateKey(k.tanggal) !== todayKey) continue;
    countToday++;
    const match = /-(\d+)$/.exec(String(k.nomor_antrian || ''));
    if (match) maxSeq = Math.max(maxSeq, Number(match[1]));
  }
  const nomor = Math.max(maxSeq, countToday) + 1;
  return `${kodePoli}-${String(nomor).padStart(3, '0')}`;
}
