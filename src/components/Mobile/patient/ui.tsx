import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';

/* ────────────────────────────── Skeleton ────────────────────────────── */

export const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden="true" className={`animate-pulse rounded-xl bg-slate-200/80 ${className}`} />
);

/** Kerangka daftar kartu sederhana selama data dimuat. */
export const SkeletonList: React.FC<{ rows?: number; label: string; className?: string }> = ({
  rows = 3,
  label,
  className = ''
}) => (
  <div role="status" aria-live="polite" aria-busy="true" className={`space-y-3 ${className}`}>
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }).map((_, idx) => (
      <div key={idx} className="rounded-2xl border border-slate-200 bg-white p-4 space-y-2.5">
        <SkeletonBlock className="h-4 w-1/3" />
        <SkeletonBlock className="h-5 w-2/3" />
        <SkeletonBlock className="h-4 w-1/2" />
      </div>
    ))}
  </div>
);

/* ────────────────────────────── Empty state ────────────────────────────── */

export const EmptyState: React.FC<{
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  tone?: 'neutral' | 'error';
  className?: string;
}> = ({ icon: Icon, title, description, action, tone = 'neutral', className = '' }) => (
  <div
    role={tone === 'error' ? 'alert' : undefined}
    className={`rounded-2xl border border-dashed p-6 text-center space-y-2 ${
      tone === 'error' ? 'border-rose-300 bg-rose-50/60' : 'border-slate-300 bg-white'
    } ${className}`}
  >
    {Icon && (
      <Icon className={`w-8 h-8 mx-auto ${tone === 'error' ? 'text-rose-500' : 'text-slate-400'}`} />
    )}
    <p className="text-sm font-bold text-slate-800">{title}</p>
    {description && <p className="text-sm text-slate-600 leading-relaxed">{description}</p>}
    {action && <div className="pt-1 flex justify-center">{action}</div>}
  </div>
);

/* ────────────────────────────── Modal dialog ────────────────────────────── */

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('aria-hidden') && el.getClientRects().length > 0
  );
}

/**
 * Dialog modal yang dapat diakses: role="dialog", aria-modal, judul terhubung via
 * aria-labelledby, Esc menutup, fokus terkunci di dalam dialog, dan fokus dikembalikan
 * ke elemen pemicu saat ditutup.
 */
export const Modal: React.FC<{
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Label aksesibel tombol tutup (ikon X). */
  closeLabel: string;
  children: React.ReactNode;
  description?: React.ReactNode;
  /** Variasi tampilan header. */
  variant?: 'plain' | 'brand';
  headerIcon?: React.ReactNode;
  maxWidthClass?: string;
  /** Elemen yang difokuskan pertama kali (default: elemen fokus pertama). */
  initialFocusRef?: React.RefObject<HTMLElement | null>;
}> = ({
  open,
  onClose,
  title,
  closeLabel,
  children,
  description,
  variant = 'plain',
  headerIcon,
  maxWidthClass = 'max-w-md',
  initialFocusRef
}) => {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;

    const focusTarget = initialFocusRef?.current || (panel ? getFocusable(panel)[0] : null) || panel;
    focusTarget?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !panelRef.current) return;
      const focusable = getFocusable(panelRef.current);
      if (focusable.length === 0) {
        event.preventDefault();
        panelRef.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panelRef.current.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !panelRef.current.contains(active))) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      }
    };
    // initialFocusRef sengaja tidak menjadi dependensi: fokus awal hanya saat dibuka.
  }, [open]);

  if (!open) return null;

  const isBrand = variant === 'brand';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-950/65 backdrop-blur-xs p-0 sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`bg-white text-slate-900 w-full ${maxWidthClass} max-h-[92vh] flex flex-col shadow-2xl overflow-hidden rounded-t-3xl sm:rounded-3xl outline-none pb-[env(safe-area-inset-bottom)] sm:pb-0`}
      >
        <div
          className={`px-5 py-3 flex items-center justify-between gap-3 ${
            isBrand ? 'bg-[#0B3D91] text-white' : 'border-b border-slate-100'
          }`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            {headerIcon}
            <div className="min-w-0">
              <h2 id={titleId} className={`text-base font-extrabold ${isBrand ? '' : 'text-slate-900'}`}>
                {title}
              </h2>
              {description && (
                <p id={descId} className={`text-sm ${isBrand ? 'text-blue-100' : 'text-slate-600'}`}>
                  {description}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className={`min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl cursor-pointer shrink-0 ${
              isBrand ? 'hover:bg-white/15' : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
};
