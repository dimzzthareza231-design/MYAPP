/**
 * Ekstraksi nilai numerik dari teks hasil laboratorium (bebas) untuk grafik tren.
 * Hanya nilai yang tertulis eksplisit yang dipakai; tidak ada interpolasi atau tebakan.
 */
import { parseExplicitDate } from './reminders';

export interface LabResultLike {
  id: string;
  jenis: string;
  pemeriksaan: string;
  tanggal: string;
  hasil: string;
}

export interface LabMeasurement {
  name: string;
  value: number;
  unit: string;
}

export interface LabTrendPoint {
  resultId: string;
  date: string;
  /** Tanggal mentah dari server (untuk ditampilkan apa adanya). */
  dateLabel: string;
  value: number;
}

export interface LabTrend {
  key: string;
  name: string;
  unit: string;
  points: LabTrendPoint[];
}

function toNumber(raw: string): number | null {
  const cleaned = raw.replace(/\s+/g, '').replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const LINE_RE = /^\s*[-•*]?\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ()%/.\-]*?)\s*[:=]\s*(-?\d+(?:[.,]\d+)?)\s*([A-Za-zµ%/][^\s(;,]*)?/;
const SOLO_RE = /^\s*(-?\d+(?:[.,]\d+)?)\s*([A-Za-zµ%/][^\s(;,]*)?\s*(?:\(.*\))?\s*$/;

/** Mengambil pasangan parameter–nilai dari teks hasil; nilai berawalan < / > diabaikan. */
export function extractMeasurements(hasil: string, fallbackName: string): LabMeasurement[] {
  const text = (hasil || '').trim();
  if (!text) return [];
  const solo = SOLO_RE.exec(text);
  if (solo && fallbackName.trim()) {
    const value = toNumber(solo[1]);
    return value === null ? [] : [{ name: fallbackName.trim(), value, unit: solo[2] ?? '' }];
  }
  const out: LabMeasurement[] = [];
  for (const line of text.split(/\r?\n|;/)) {
    const match = LINE_RE.exec(line);
    if (!match) continue;
    const value = toNumber(match[2]);
    if (value === null) continue;
    out.push({ name: match[1].trim().replace(/\s+/g, ' '), value, unit: match[3] ?? '' });
  }
  return out;
}

function normKey(name: string, unit: string): string {
  return `${name.toLowerCase().replace(/[^a-z0-9%]+/g, '')}|${unit.toLowerCase()}`;
}

/**
 * Mengelompokkan nilai per parameter (+ satuan yang sama) lintas hasil. Hanya parameter
 * dengan ≥ 2 nilai dari hasil berbeda yang dikembalikan. Titik diurutkan dari terlama.
 */
export function buildLabTrends(results: LabResultLike[]): LabTrend[] {
  const groups = new Map<string, LabTrend>();
  // Server mengirim hasil terbaru lebih dulu; urutan masuk dipakai bila tanggal tidak terbaca.
  results.forEach((result, index) => {
    const date = parseExplicitDate(result.tanggal) ?? '';
    for (const m of extractMeasurements(result.hasil, result.pemeriksaan)) {
      const key = normKey(m.name, m.unit);
      let group = groups.get(key);
      if (!group) {
        group = { key, name: m.name, unit: m.unit, points: [] };
        groups.set(key, group);
      }
      if (group.points.some((p) => p.resultId === result.id)) continue;
      group.points.push({ resultId: result.id, date: date || `~${String(results.length - index).padStart(6, '0')}`, dateLabel: result.tanggal, value: m.value });
    }
  });
  return Array.from(groups.values())
    .filter((g) => g.points.length >= 2)
    .map((g) => ({ ...g, points: [...g.points].sort((a, b) => a.date.localeCompare(b.date)) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'id'));
}

/** Koordinat polyline SVG untuk sparkline (y dibalik: nilai besar di atas). */
export function sparklinePoints(values: number[], width: number, height: number, padding = 4): Array<[number, number]> {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = width - padding * 2;
  const innerH = height - padding * 2;
  return values.map((v, i) => {
    const x = padding + (values.length === 1 ? innerW / 2 : (innerW * i) / (values.length - 1));
    const y = max === min ? height / 2 : padding + innerH - ((v - min) / span) * innerH;
    return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
  });
}
