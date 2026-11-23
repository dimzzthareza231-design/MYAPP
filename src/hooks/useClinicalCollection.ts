import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { storage } from '../utils/storage';
import {
  ClinicalApiError,
  clinicalRequest,
  describeClinicalError,
  initialClinicalBackend,
  resolveClinicalBackend,
  type ClinicalBackend
} from '../lib/clinicalApi';

type ClinicalRecord = { id: string };

export interface ClinicalCollectionOptions<T extends ClinicalRecord> {
  /** Endpoint daftar, mis. /api/v1/billing/invoices */
  listPath: string;
  /** Endpoint PUT untuk satu record. */
  itemPath: (id: string) => string;
  /** Endpoint POST untuk record baru; tanpa ini record baru ditolak di mode server. */
  createPath?: string;
  createDeniedMessage?: string;
  /** Kunci localStorage dan data contoh untuk mode demo (STORAGE_MODE=memory). */
  demoKey: string;
  demoInitial: T[];
  onError?: (message: string) => void;
}

export interface ClinicalCollection<T extends ClinicalRecord> {
  records: T[];
  /** Pengganti setState: di mode server setiap record yang berubah dikirim ke API; gagal = dikembalikan. */
  setRecords: (update: SetStateAction<T[]>) => void;
  backend: ClinicalBackend | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

function versionOf(record: unknown): number | undefined {
  const version = (record as { version?: unknown })?.version;
  return typeof version === 'number' ? version : undefined;
}

/**
 * Koleksi data klinis yang disinkronkan ke server.
 * Perubahan dihitung per record (diff JSON) sehingga komponen lama yang memakai setState(prev => ...)
 * tetap bekerja tanpa diubah; tiap record yang berubah disimpan berurutan dengan cek versi optimistik.
 */
export function useClinicalCollection<T extends ClinicalRecord>(
  options: ClinicalCollectionOptions<T>
): ClinicalCollection<T> {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const startBackend = initialClinicalBackend();
  const [backend, setBackend] = useState<ClinicalBackend | null>(startBackend);
  const backendRef = useRef<ClinicalBackend | null>(startBackend);
  const [records, setRecordsState] = useState<T[]>(() =>
    startBackend === 'demo' ? storage.get<T[]>(options.demoKey, options.demoInitial) || options.demoInitial : []
  );
  const recordsRef = useRef<T[]>(records);
  const [loading, setLoadingState] = useState(startBackend !== 'demo');
  const loadingRef = useRef(startBackend !== 'demo');
  const setLoading = useCallback((value: boolean) => {
    loadingRef.current = value;
    setLoadingState(value);
  }, []);
  const [pendingSaves, setPendingSaves] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const serverIds = useRef(new Set<string>());
  const versions = useRef(new Map<string, number>());
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const serverLoaded = useRef(false);

  const commitState = useCallback((next: T[]) => {
    recordsRef.current = next;
    setRecordsState(next);
  }, []);

  const reportError = useCallback((message: string) => {
    setError(message);
    optionsRef.current.onError?.(message);
  }, []);

  const reload = useCallback(async () => {
    const mode = await resolveClinicalBackend();
    backendRef.current = mode;
    setBackend(mode);
    const { demoKey, demoInitial, listPath } = optionsRef.current;
    if (mode === 'demo') {
      commitState(storage.get<T[]>(demoKey, demoInitial) || demoInitial);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const body = await clinicalRequest<{ data: T[] }>(`${listPath}?limit=500`, 'GET');
      const data = Array.isArray(body.data) ? body.data : [];
      serverIds.current = new Set(data.map((record) => record.id));
      versions.current = new Map(data.map((record) => [record.id, versionOf(record) ?? 0]));
      commitState(data);
      serverLoaded.current = true;
      setError(null);
    } catch (loadError) {
      setError(describeClinicalError(loadError));
    } finally {
      setLoading(false);
    }
  }, [commitState, setLoading]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const persistRecord = useCallback(async (sent: T, before: T | undefined) => {
    const { itemPath, createPath, createDeniedMessage } = optionsRef.current;
    const sentJson = JSON.stringify(sent);
    setPendingSaves((count) => count + 1);
    try {
      const exists = serverIds.current.has(sent.id);
      if (!exists && !createPath) {
        throw new ClinicalApiError(
          'CREATE_NOT_ALLOWED',
          createDeniedMessage || 'Data baru tidak dapat dibuat dari modul ini.'
        );
      }
      const body = await clinicalRequest<{ data: T }>(
        exists ? itemPath(sent.id) : createPath!,
        exists ? 'PUT' : 'POST',
        exists ? { ...sent, version: versions.current.get(sent.id) } : sent
      );
      serverIds.current.add(body.data.id);
      versions.current.set(body.data.id, versionOf(body.data) ?? 0);
      // Ganti salinan lokal dengan versi server hanya jika belum ada edit lokal yang lebih baru.
      const current = recordsRef.current.find((record) => record.id === sent.id);
      if (current && JSON.stringify(current) === sentJson) {
        commitState(recordsRef.current.map((record) => (record.id === sent.id ? body.data : record)));
      }
      setError(null);
    } catch (saveError) {
      const current = recordsRef.current.find((record) => record.id === sent.id);
      if (current && JSON.stringify(current) === sentJson) {
        commitState(
          before
            ? recordsRef.current.map((record) => (record.id === sent.id ? before : record))
            : recordsRef.current.filter((record) => record.id !== sent.id)
        );
      }
      reportError(describeClinicalError(saveError));
    } finally {
      setPendingSaves((count) => count - 1);
    }
  }, [commitState, reportError]);

  const setRecords = useCallback((update: SetStateAction<T[]>) => {
    const previous = recordsRef.current;
    const next = typeof update === 'function' ? (update as (prev: T[]) => T[])(previous) : update;
    if (next === previous) return;

    if (backendRef.current === 'demo') {
      commitState(next);
      storage.set(optionsRef.current.demoKey, next);
      return;
    }
    if (backendRef.current !== 'server' || loadingRef.current) {
      reportError('Data masih dimuat dari server. Coba lagi sebentar.');
      return;
    }
    if (!serverLoaded.current) {
      reportError('Data belum berhasil dimuat dari server. Muat ulang sebelum melakukan perubahan.');
      return;
    }

    const previousById = new Map(previous.map((record) => [record.id, record]));
    const changed = next.filter((record) => {
      const before = previousById.get(record.id);
      return !before || JSON.stringify(before) !== JSON.stringify(record);
    });
    commitState(next);
    for (const record of changed) {
      const before = previousById.get(record.id);
      saveQueue.current = saveQueue.current.then(() => persistRecord(record, before));
    }
  }, [commitState, persistRecord, reportError]);

  return { records, setRecords, backend, loading, saving: pendingSaves > 0, error, reload };
}
