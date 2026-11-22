export const fadeSlideVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 22 : -22,
    y: 6
  }),
  center: {
    opacity: 1,
    x: 0,
    y: 0
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -22 : 22,
    y: -4
  })
};

export const fadeSlideTransition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const
};

export function formatRupiah(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function formatClock(value: string | number | Date): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Tanggal lokal perangkat dalam format YYYY-MM-DD (bukan UTC). */
export function toLocalIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function localTodayIso(): string {
  return toLocalIsoDate(new Date());
}

export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  date.setDate(date.getDate() + days);
  return toLocalIsoDate(date);
}

/** Hari dalam minggu (0 = Minggu) untuk tanggal YYYY-MM-DD, dihitung di zona lokal. */
export function weekdayOfIso(iso: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

export const WEEKDAY_NAMES_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

const DAY_ALIASES: Array<[RegExp, number]> = [
  [/^(minggu|ahad)/, 0],
  [/^senin/, 1],
  [/^selasa/, 2],
  [/^rabu/, 3],
  [/^kamis/, 4],
  [/^(jumat|jum'at)/, 5],
  [/^sabtu/, 6]
];

function dayIndex(token: string): number | null {
  const t = token.trim().toLowerCase();
  for (const [re, idx] of DAY_ALIASES) {
    if (re.test(t)) return idx;
  }
  return null;
}

/**
 * Mengurai teks hari praktik dokter (mis. "Senin, Rabu, Jumat", "Senin - Jumat",
 * "Setiap Hari") menjadi himpunan hari (0 = Minggu). Mengembalikan null bila teks
 * kosong atau tidak dapat dipahami, sehingga pemanggil tidak membatasi tanggal.
 */
export function parsePracticeDays(text: string | undefined | null): Set<number> | null {
  if (!text || !text.trim()) return null;
  const normalized = text.toLowerCase();
  if (/setiap hari|tiap hari|24 jam/.test(normalized)) {
    return new Set([0, 1, 2, 3, 4, 5, 6]);
  }
  // Abaikan keterangan dalam kurung, mis. "(Rotasi)".
  const cleaned = normalized.replace(/\([^)]*\)/g, ' ');
  const result = new Set<number>();
  const parts = cleaned.split(/,|&|\/|\bdan\b/).map((part) => part.trim()).filter(Boolean);
  for (const part of parts) {
    const range = part.split(/\s*(?:-|–|—|s\.?\s*d\.?|sampai)\s*/).filter(Boolean);
    if (range.length === 2) {
      const start = dayIndex(range[0]);
      const end = dayIndex(range[1]);
      if (start === null || end === null) continue;
      let cursor = start;
      for (let guard = 0; guard < 7; guard += 1) {
        result.add(cursor);
        if (cursor === end) break;
        cursor = (cursor + 1) % 7;
      }
    } else {
      const single = dayIndex(part);
      if (single !== null) result.add(single);
    }
  }
  return result.size > 0 ? result : null;
}

/** Tanggal praktik terdekat mulai hari ini (maksimal `count` tanggal dalam `horizonDays` hari). */
export function upcomingPracticeDates(
  practiceDays: Set<number> | null,
  fromIso: string,
  count = 6,
  horizonDays = 60
): string[] {
  const dates: string[] = [];
  for (let offset = 0; offset < horizonDays && dates.length < count; offset += 1) {
    const iso = addDaysIso(fromIso, offset);
    const weekday = weekdayOfIso(iso);
    if (!practiceDays || (weekday !== null && practiceDays.has(weekday))) {
      dates.push(iso);
    }
  }
  return dates;
}

export function formatShortDateId(iso: string): string {
  const weekday = weekdayOfIso(iso);
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1);
  const label = date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
  return weekday === null ? label : `${WEEKDAY_NAMES_ID[weekday].slice(0, 3)}, ${label}`;
}

/** Tagihan dianggap ada bila server mengirim rincian atau nominal; bukan sekadar status bawaan. */
export function hasBillingData(billing: { items?: unknown[]; totalBiaya?: number } | null | undefined): boolean {
  if (!billing) return false;
  return (Array.isArray(billing.items) && billing.items.length > 0) || (billing.totalBiaya ?? 0) > 0;
}

/** Nilai teks klinis kosong ditampilkan sebagai tanda pisah, bukan angka karangan. */
export function displayValue(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  const text = String(value).trim();
  return text ? text : '—';
}
