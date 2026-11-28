import { AlertTriangle } from 'lucide-react';

// Angka di halaman bridging masih hardcoded; label ini mencegah dibaca sebagai status layanan nyata.
export function DemoDataBadge({ className = '' }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-700 ${className}`}>
      <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
      Data contoh — belum terhubung ke layanan
    </span>
  );
}
