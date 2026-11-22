/*
 * Utilitas murni (tanpa React) untuk halaman publik: slug dokter/artikel, parsing hari praktik,
 * filter direktori dokter, dan daftar rute statis (dipakai sitemap & footer).
 * Diuji di tests/portalPublic.test.ts.
 */
import type { HealthArticle } from '../../data/hospitalPublicCatalog';
import type { LiveDoctor } from './portalShared';

export const WEEK_DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

/** Ubah teks bebas menjadi slug URL huruf kecil (a-z, 0-9, '-'). */
export function slugify(text: string): string {
  return (text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

/**
 * Slug profil dokter. Memakai `slug` dari server bila ada; selain itu nama + id
 * (id menjamin keunikan meski ada dua dokter bernama sama).
 */
export function doctorSlug(doc: Pick<LiveDoctor, 'id' | 'nama'> & { slug?: string }): string {
  const fromServer = slugify(doc.slug || '');
  if (fromServer) return fromServer;
  const base = slugify(doc.nama.replace(/^(dr\.|drg\.)\s*/i, ''));
  const id = slugify(doc.id);
  return [base, id].filter(Boolean).join('-') || id;
}

export function findDoctorBySlug<T extends Pick<LiveDoctor, 'id' | 'nama'> & { slug?: string }>(
  doctors: T[],
  slug: string
): T | undefined {
  const target = slugify(slug);
  return doctors.find((d) => doctorSlug(d) === target);
}

export function articleSlug(article: Pick<HealthArticle, 'id' | 'title'> & { slug?: string }): string {
  return slugify(article.slug || '') || slugify(article.title) || slugify(article.id);
}

function normalizeDay(token: string): WeekDay | null {
  const t = token.trim().toLowerCase();
  if (!t) return null;
  if (t === 'ahad') return 'Minggu';
  return WEEK_DAYS.find((d) => d.toLowerCase() === t || (t.length >= 3 && d.toLowerCase().startsWith(t.slice(0, 3)))) ?? null;
}

/**
 * Ubah teks hari praktik ("Senin - Jumat", "Selasa, Kamis", "Senin - Minggu (Rotasi)")
 * menjadi daftar hari. Teks yang tidak dikenali menghasilkan [] (tidak menebak).
 */
export function parsePracticeDays(hari: string | undefined | null): WeekDay[] {
  const text = (hari || '').replace(/\(.*?\)/g, ' ').trim();
  if (!text) return [];
  const result = new Set<WeekDay>();
  for (const part of text.split(/[,;/&]|\bdan\b/i)) {
    const range = part.split(/\s*(?:-|–|—|s\.?\/?d\.?|sampai)\s*/i).filter((p) => p.trim());
    if (range.length === 2) {
      const start = normalizeDay(range[0]);
      const end = normalizeDay(range[1]);
      if (start && end) {
        let i = WEEK_DAYS.indexOf(start);
        const stop = WEEK_DAYS.indexOf(end);
        // Dukung rentang melewati akhir pekan (mis. Sabtu - Senin).
        for (let guard = 0; guard < 7; guard++) {
          result.add(WEEK_DAYS[i]);
          if (i === stop) break;
          i = (i + 1) % 7;
        }
        continue;
      }
    }
    const single = normalizeDay(part);
    if (single) result.add(single);
  }
  return WEEK_DAYS.filter((d) => result.has(d));
}

export interface DoctorFilter {
  query?: string;
  poliId?: string;
  day?: string;
}

export function filterDoctors<T extends LiveDoctor>(doctors: T[], filter: DoctorFilter): T[] {
  const q = (filter.query || '').trim().toLowerCase();
  const poliId = filter.poliId && filter.poliId !== 'ALL' ? filter.poliId : '';
  const day = filter.day && filter.day !== 'ALL' ? filter.day : '';
  return doctors.filter((doc) => {
    if (poliId && doc.poli_id !== poliId) return false;
    if (day && !parsePracticeDays(doc.hari).includes(day as WeekDay)) return false;
    if (!q) return true;
    return [doc.nama, doc.spesialis, doc.subspesialis, doc.poli]
      .map((v) => (v || '').toLowerCase())
      .some((v) => v.includes(q));
  });
}

/** Ambil daftar string opsional dari data server (array string atau teks dipisah koma/baris baru). */
export function toStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === 'string').map((v) => v.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/\n|;|,(?![^()]*\))/)
      .map((v) => v.trim())
      .filter(Boolean);
  }
  return [];
}

/** Validasi minimal objek dokter dari GET /api/public/hospital-catalog. */
export function isPublicDoctor(value: unknown): value is LiveDoctor {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.nama === 'string' && typeof v.poli_id === 'string';
}

/** Rute statis web publik (untuk sitemap.xml & tautan footer). */
export const PUBLIC_STATIC_ROUTES: Array<{ path: string; label: string }> = [
  { path: '/', label: 'Beranda' },
  { path: '/dokter', label: 'Cari Dokter' },
  { path: '/artikel', label: 'Artikel Kesehatan' },
  { path: '/bpjs', label: 'Alur Pasien BPJS' },
  { path: '/faq', label: 'Tanya Jawab (FAQ)' },
  { path: '/hak-pasien', label: 'Hak & Kewajiban Pasien' },
  { path: '/pengaduan', label: 'Pengaduan & Masukan' },
  { path: '/kebijakan-privasi', label: 'Kebijakan Privasi' },
  { path: '/syarat-layanan', label: 'Syarat Layanan' }
];
