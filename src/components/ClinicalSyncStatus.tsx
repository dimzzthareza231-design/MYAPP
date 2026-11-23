import React from 'react';
import type { ClinicalBackend } from '../lib/clinicalApi';

interface ClinicalSyncStatusProps {
  label: string;
  backend: ClinicalBackend | null;
  loading: boolean;
  saving?: boolean;
  error: string | null;
  onRetry?: () => void;
}

/** Baris status ringkas untuk modul klinis yang datanya tersimpan di server. */
export function ClinicalSyncStatus({ label, backend, loading, saving, error, onRetry }: ClinicalSyncStatusProps) {
  if (backend === 'demo') {
    return (
      <div role="status" className="text-[11px] text-amber-700 dark:text-amber-300">
        Mode demo (STORAGE_MODE=memory): data {label} hanya tersimpan di peramban ini.
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
        <span>{error}</span>
        {onRetry && (
          <button type="button" onClick={onRetry} className="font-bold underline">
            Muat ulang
          </button>
        )}
      </div>
    );
  }
  if (loading || backend === null) {
    return <div role="status" className="text-[11px] text-slate-500">Memuat data {label} dari server...</div>;
  }
  if (saving) {
    return <div role="status" className="text-[11px] text-slate-500">Menyimpan perubahan {label}...</div>;
  }
  return null;
}

export default ClinicalSyncStatus;
