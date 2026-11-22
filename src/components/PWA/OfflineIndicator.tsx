import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

interface OfflineIndicatorProps {
  /** Sembunyikan indikator (mis. di aplikasi pasien yang punya banner offline sendiri). */
  hidden?: boolean;
}

export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ hidden = false }) => {
  const isOnline = useOnlineStatus();

  if (isOnline || hidden) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 md:bottom-4 left-4 z-[90] flex items-center gap-2 rounded-xl bg-amber-700 px-3.5 py-2 text-xs font-semibold text-white shadow-lg border border-amber-500/40"
    >
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>Anda sedang offline. Data mungkin tidak terbaru.</span>
    </div>
  );
};
