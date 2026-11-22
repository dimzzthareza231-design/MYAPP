/**
 * Helper murni untuk pengingat di sisi klien: berkas kalender (.ics) untuk janji temu
 * & jadwal kontrol, serta jadwal pengingat minum obat yang disimpan di perangkat.
 * Tidak ada data yang dikirim ke server dari modul ini.
 */

/* ────────────────────────────── Tanggal & jam ────────────────────────────── */

const MONTHS_ID: Record<string, number> = {
  jan: 1, januari: 1,
  feb: 2, februari: 2, pebruari: 2,
  mar: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5,
  jun: 6, juni: 6,
  jul: 7, juli: 7,
  agu: 8, agt: 8, agustus: 8, aug: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10,
  nov: 11, nopember: 11, november: 11,
  des: 12, desember: 12, dec: 12
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * Mencari tanggal eksplisit di dalam teks bebas: `2026-12-01`, `01/12/2026`, `1-12-2026`,
 * atau `1 Desember 2026`. Teks relatif ("1 minggu lagi") sengaja TIDAK ditebak.
 * Mengembalikan YYYY-MM-DD atau null.
 */
export function parseExplicitDate(text: string | null | undefined): string | null {
  if (!text) return null;
  const value = String(text);
  let match = /(\d{4})-(\d{1,2})-(\d{1,2})/.exec(value);
  if (match) {
    const [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return isValidYmd(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }
  match = /\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b/.exec(value);
  if (match) {
    const [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    return isValidYmd(y, m, d) ? `${y}-${pad2(m)}-${pad2(d)}` : null;
  }
  match = /\b(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})\b/.exec(value);
  if (match) {
    const month = MONTHS_ID[match[2].toLowerCase()];
    const [d, y] = [Number(match[1]), Number(match[3])];
    if (month && isValidYmd(y, month, d)) return `${y}-${pad2(month)}-${pad2(d)}`;
  }
  return null;
}

/** Jam HH:MM valid (00:00–23:59) dinormalisasi; titik juga diterima (08.30). */
export function normalizeTime(value: string | null | undefined): string | null {
  if (!value) return null;
  const match = /^\s*(\d{1,2})[:.](\d{2})\s*$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return `${pad2(h)}:${pad2(m)}`;
}

/** Mengurai jam praktik "08:00 - 12:00" / "08.00-14.00 WIB" menjadi jam mulai & selesai. */
export function parseTimeRange(text: string | null | undefined): { start: string; end: string | null } | null {
  if (!text) return null;
  const times = String(text).match(/\b\d{1,2}[:.]\d{2}\b/g) ?? [];
  const start = normalizeTime(times[0]);
  if (!start) return null;
  const end = normalizeTime(times[1]);
  return { start, end: end && end > start ? end : null };
}

/* ────────────────────────────── iCalendar (.ics) ────────────────────────────── */

export interface IcsEventInput {
  uid: string;
  title: string;
  /** YYYY-MM-DD (tanggal lokal). */
  date: string;
  /** HH:MM lokal; tanpa jam → acara sepanjang hari. */
  startTime?: string | null;
  endTime?: string | null;
  /** Durasi default bila endTime kosong (menit). */
  durationMinutes?: number;
  description?: string;
  location?: string;
  /** Alarm sebelum acara (menit). Untuk acara sepanjang hari dihitung dari pukul 00:00. */
  alarmMinutesBefore?: number | null;
  /** Waktu pembuatan (DTSTAMP); default sekarang. */
  now?: Date;
}

/** Escape teks sesuai RFC 5545 §3.3.11. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r\n|\r|\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

/** Lipat baris > 75 oktet (UTF-8) menjadi baris lanjutan diawali spasi. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const ch of line) {
    const bytes = encoder.encode(ch).length;
    const limit = parts.length === 0 ? 75 : 74; // baris lanjutan diawali 1 spasi
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = '';
      currentBytes = 0;
    }
    current += ch;
    currentBytes += bytes;
  }
  if (current) parts.push(current);
  return parts.join('\r\n ');
}

function compactDate(iso: string): string {
  return iso.replace(/-/g, '');
}

function utcStamp(date: Date): string {
  return (
    `${date.getUTCFullYear()}${pad2(date.getUTCMonth() + 1)}${pad2(date.getUTCDate())}` +
    `T${pad2(date.getUTCHours())}${pad2(date.getUTCMinutes())}${pad2(date.getUTCSeconds())}Z`
  );
}

function addMinutesLocal(date: string, time: string, minutes: number): { date: string; time: string } {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(y, m - 1, d, hh, mm + minutes);
  return {
    date: `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`,
    time: `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`
  };
}

function nextDayIso(date: string): string {
  return addMinutesLocal(date, '00:00', 24 * 60).date;
}

/**
 * Membuat VCALENDAR berisi satu VEVENT. Waktu ditulis sebagai "floating time" (jam lokal
 * perangkat), cocok untuk jadwal klinik yang dinyatakan dalam jam setempat.
 */
export function buildIcsEvent(input: IcsEventInput): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error('Tanggal acara tidak valid');
  const start = normalizeTime(input.startTime ?? null);
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MYITARU//Aplikasi Pasien//ID',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${input.uid.replace(/[^\w.@-]/g, '')}@myitaru`,
    `DTSTAMP:${utcStamp(input.now ?? new Date())}`
  ];
  if (start) {
    const explicitEnd = normalizeTime(input.endTime ?? null);
    const end =
      explicitEnd && explicitEnd > start
        ? { date: input.date, time: explicitEnd }
        : addMinutesLocal(input.date, start, Math.max(5, input.durationMinutes ?? 60));
    lines.push(`DTSTART:${compactDate(input.date)}T${start.replace(':', '')}00`);
    lines.push(`DTEND:${compactDate(end.date)}T${end.time.replace(':', '')}00`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(input.date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(nextDayIso(input.date))}`);
  }
  lines.push(`SUMMARY:${escapeIcsText(input.title)}`);
  if (input.description) lines.push(`DESCRIPTION:${escapeIcsText(input.description)}`);
  if (input.location) lines.push(`LOCATION:${escapeIcsText(input.location)}`);
  const alarm = input.alarmMinutesBefore;
  if (typeof alarm === 'number' && Number.isFinite(alarm) && alarm >= 0) {
    lines.push(
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escapeIcsText(input.title)}`,
      `TRIGGER:-PT${Math.round(alarm)}M`,
      'END:VALARM'
    );
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n') + '\r\n';
}

/** Nama berkas aman untuk unduhan .ics. */
export function icsFileName(prefix: string, date: string): string {
  const safe = prefix
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${safe || 'jadwal'}-${date}.ics`;
}

/* ────────────────────────────── Pengingat obat ────────────────────────────── */

export interface MedicineReminder {
  id: string;
  medName: string;
  dose: string;
  /** Teks aturan pakai asli dari resep (untuk ditampilkan apa adanya). */
  instruction: string;
  /** Jam pengingat HH:MM, terurut & unik. */
  times: string[];
  enabled: boolean;
  createdAt: string;
}

/** Usulan jam standar per jumlah dosis sehari. Pasien dapat mengubahnya. */
const DEFAULT_TIMES: Record<number, string[]> = {
  1: ['07:00'],
  2: ['07:00', '19:00'],
  3: ['07:00', '13:00', '19:00'],
  4: ['06:00', '12:00', '18:00', '22:00'],
  5: ['06:00', '10:00', '14:00', '18:00', '22:00'],
  6: ['06:00', '10:00', '14:00', '18:00', '22:00', '02:00']
};

/**
 * Menebak jumlah dosis per hari dari aturan pakai bebas (mis. "3x1", "2 x sehari",
 * "tiap 8 jam", "1 kali sehari"). Mengembalikan null bila tidak dapat dipahami
 * (mis. "bila perlu") agar UI meminta pasien mengisi jam sendiri.
 */
export function dosesPerDay(frequency: string | null | undefined): number | null {
  if (!frequency) return null;
  const text = String(frequency).toLowerCase();
  if (/\b(bila|jika|kalau)\s+perlu\b|\bprn\b/.test(text)) return null;
  const every = /(?:tiap|setiap|per)\s*(\d{1,2})\s*jam/.exec(text);
  if (every) {
    const hours = Number(every[1]);
    if (hours >= 4 && hours <= 24 && 24 % hours === 0) return 24 / hours;
    return null;
  }
  const times = /(\d)\s*(?:x|×|kali)/.exec(text);
  if (times) {
    const n = Number(times[1]);
    return n >= 1 && n <= 6 ? n : null;
  }
  if (/\b(sekali|satu kali)\b/.test(text)) return 1;
  const latin = /\b(qd|od|bid|tid|qid)\b/.exec(text);
  if (latin) return { qd: 1, od: 1, bid: 2, tid: 3, qid: 4 }[latin[1] as 'qd' | 'od' | 'bid' | 'tid' | 'qid'];
  return null;
}

export function suggestReminderTimes(frequency: string | null | undefined): string[] {
  const n = dosesPerDay(frequency);
  return n ? sortTimes(DEFAULT_TIMES[n]) : [];
}

/** Normalisasi, hapus duplikat & urutkan daftar jam. Jam tidak valid dibuang. */
export function sortTimes(times: Array<string | null | undefined>): string[] {
  const set = new Set<string>();
  for (const t of times) {
    const n = normalizeTime(t ?? null);
    if (n) set.add(n);
  }
  return Array.from(set).sort();
}

/** Kejadian pengingat berikutnya untuk satu daftar jam, relatif terhadap `now` (zona lokal). */
export function nextOccurrence(times: string[], now: Date): Date | null {
  const valid = sortTimes(times);
  if (valid.length === 0) return null;
  for (let dayOffset = 0; dayOffset <= 1; dayOffset += 1) {
    for (const t of valid) {
      const [hh, mm] = t.split(':').map(Number);
      const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hh, mm, 0, 0);
      if (candidate.getTime() > now.getTime()) return candidate;
    }
  }
  return null;
}

export interface ScheduledReminder {
  reminder: MedicineReminder;
  at: Date;
}

/** Semua pengingat aktif dalam rentang `horizonMs` dari `now`, terurut waktu. */
export function upcomingReminders(reminders: MedicineReminder[], now: Date, horizonMs = 24 * 60 * 60 * 1000): ScheduledReminder[] {
  const end = now.getTime() + horizonMs;
  const out: ScheduledReminder[] = [];
  for (const reminder of reminders) {
    if (!reminder.enabled) continue;
    const times = sortTimes(reminder.times);
    for (let dayOffset = 0; dayOffset <= Math.ceil(horizonMs / 86_400_000); dayOffset += 1) {
      for (const t of times) {
        const [hh, mm] = t.split(':').map(Number);
        const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + dayOffset, hh, mm, 0, 0);
        if (at.getTime() > now.getTime() && at.getTime() <= end) out.push({ reminder, at });
      }
    }
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/* ────────────────────────────── Penyimpanan lokal ────────────────────────────── */

export const MED_REMINDER_STORAGE_KEY = 'myitaru_med_reminders_v1';
export const MED_REMINDER_CHANGED_EVENT = 'myitaru:med-reminders-changed';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function isReminder(value: unknown): value is MedicineReminder {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.medName === 'string' &&
    Array.isArray(v.times) &&
    typeof v.enabled === 'boolean'
  );
}

function readAll(storage: StorageLike | null | undefined): Record<string, unknown> {
  if (!storage) return {};
  try {
    const raw = storage.getItem(MED_REMINDER_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** Pengingat milik satu pasien (dikelompokkan per No. RM agar akun keluarga tidak tercampur). */
export function loadReminders(storage: StorageLike | null | undefined, owner: string): MedicineReminder[] {
  if (!owner) return [];
  const list = readAll(storage)[owner];
  if (!Array.isArray(list)) return [];
  return list.filter(isReminder).map((r) => ({
    ...r,
    dose: typeof r.dose === 'string' ? r.dose : '',
    instruction: typeof r.instruction === 'string' ? r.instruction : '',
    createdAt: typeof r.createdAt === 'string' ? r.createdAt : '',
    times: sortTimes(r.times)
  }));
}

/** Menyimpan pengingat; mengembalikan false bila penyimpanan diblokir/penuh. */
export function saveReminders(storage: StorageLike | null | undefined, owner: string, reminders: MedicineReminder[]): boolean {
  if (!storage || !owner) return false;
  try {
    const all = readAll(storage);
    if (reminders.length === 0) delete all[owner];
    else all[owner] = reminders.map((r) => ({ ...r, times: sortTimes(r.times) }));
    storage.setItem(MED_REMINDER_STORAGE_KEY, JSON.stringify(all));
    return true;
  } catch {
    return false;
  }
}

/** Akses localStorage yang aman (null bila diblokir, mis. mode privat ketat). */
export function safeLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}
