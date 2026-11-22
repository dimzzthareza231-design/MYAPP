import { useCallback, useEffect, useState } from 'react';
import { isPublicDoctor } from './publicDirectory';
import type { LiveDoctor, PublicPoli } from './portalShared';

export type CatalogStatus = 'loading' | 'ready' | 'error';

interface CatalogData {
  doctors: LiveDoctor[];
  poliklinik: PublicPoli[];
}

// Cache di memori agar berpindah antara /dokter dan /dokter/:slug tidak memuat ulang.
let cached: CatalogData | null = null;
let inflight: Promise<CatalogData> | null = null;

function loadCatalog(force = false): Promise<CatalogData> {
  if (cached && !force) return Promise.resolve(cached);
  if (inflight && !force) return inflight;
  inflight = fetch('/api/public/hospital-catalog')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
    .then((data) => {
      const doctors: LiveDoctor[] = Array.isArray(data?.doctors) ? data.doctors.filter(isPublicDoctor) : [];
      const poliklinik: PublicPoli[] = Array.isArray(data?.poliklinik)
        ? data.poliklinik.filter(
            (p: unknown): p is PublicPoli =>
              !!p && typeof (p as PublicPoli).id === 'string' && typeof (p as PublicPoli).nama === 'string'
          )
        : [];
      cached = { doctors, poliklinik };
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/** Katalog dokter & poliklinik dari GET /api/public/hospital-catalog (tanpa data cadangan). */
export function usePublicCatalog() {
  const [data, setData] = useState<CatalogData>(cached ?? { doctors: [], poliklinik: [] });
  const [status, setStatus] = useState<CatalogStatus>(cached ? 'ready' : 'loading');

  const run = useCallback((force: boolean) => {
    let cancelled = false;
    if (force || !cached) setStatus('loading');
    loadCatalog(force)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => run(false), [run]);

  return { ...data, status, reload: () => run(true) };
}
