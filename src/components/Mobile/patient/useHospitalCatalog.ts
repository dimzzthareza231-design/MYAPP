import { useCallback, useEffect, useMemo, useState } from 'react';
import type { LoadStatus, PublicDoctor, PublicPoliklinik } from './types';

function isDoctor(value: unknown): value is PublicDoctor {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.nama === 'string' &&
    typeof v.poli_id === 'string' &&
    typeof v.poli === 'string'
  );
}

function isPoli(value: unknown): value is PublicPoliklinik {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v.id === 'string' && typeof v.nama === 'string';
}

/**
 * Katalog dokter & poliklinik publik dari server. Tidak ada data cadangan di sisi klien:
 * bila server tidak mengembalikan dokter, daftar memang kosong.
 */
export function useHospitalCatalog() {
  const [doctors, setDoctors] = useState<PublicDoctor[]>([]);
  const [poliklinikRaw, setPoliklinikRaw] = useState<PublicPoliklinik[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    fetch('/api/public/hospital-catalog')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((data) => {
        if (cancelled) return;
        const docs = Array.isArray(data?.doctors) ? data.doctors.filter(isDoctor) : [];
        const polis = Array.isArray(data?.poliklinik) ? data.poliklinik.filter(isPoli) : [];
        setDoctors(
          docs.map((d: PublicDoctor) => ({
            ...d,
            spesialis: typeof d.spesialis === 'string' ? d.spesialis : ''
          }))
        );
        setPoliklinikRaw(polis.map((p: PublicPoliklinik) => ({ id: p.id, nama: p.nama })));
        setStatus('ready');
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  // Hanya tampilkan poliklinik yang memiliki dokter terjadwal; bila server tidak
  // mengirim daftar poli, turunkan dari data dokter.
  const poliklinik = useMemo<PublicPoliklinik[]>(() => {
    const withDoctors = new Set(doctors.map((d) => d.poli_id));
    if (poliklinikRaw.length > 0) {
      return poliklinikRaw.filter((p) => withDoctors.has(p.id));
    }
    const derived = new Map<string, string>();
    doctors.forEach((d) => {
      if (!derived.has(d.poli_id)) derived.set(d.poli_id, d.poli);
    });
    return Array.from(derived, ([id, nama]) => ({ id, nama })).sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [doctors, poliklinikRaw]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  return { doctors, poliklinik, status, reload };
}
