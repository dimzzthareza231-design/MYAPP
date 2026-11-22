import { useCallback, useEffect, useState } from 'react';
import { accountApi, type FamilyOverview } from './accountApi';

/** Daftar akun keluarga untuk sesi aktif; dimuat ulang setiap token berganti (mis. setelah beralih akun). */
export function useFamily(token: string | null) {
  const [family, setFamily] = useState<FamilyOverview | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const reload = useCallback(async () => {
    if (!token) {
      setFamily(null);
      setStatus('idle');
      return;
    }
    setStatus((s) => (s === 'ready' ? s : 'loading'));
    try {
      const data = await accountApi.family(token);
      setFamily(data);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [token]);

  useEffect(() => {
    setFamily(null);
    void reload();
  }, [reload]);

  return { family, status, reload };
}

export type FamilyState = ReturnType<typeof useFamily>;
