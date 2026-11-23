import React, { useId, useRef } from 'react';
import { AlertCircle, X } from 'lucide-react';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface ConfirmationModalProps {
  isOpen: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationModal({
  isOpen,
  title = 'Konfirmasi Tindakan',
  message,
  confirmLabel = 'Ya, Lanjutkan',
  cancelLabel = 'Batal',
  variant = 'warning',
  onConfirm,
  onCancel,
}: ConfirmationModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const messageId = useId();
  // Fokus awal pada tombol "Batal" agar Enter tidak langsung mengeksekusi aksi berisiko.
  useDialogA11y(isOpen, onCancel, dialogRef, { initialFocusRef: cancelRef });

  if (!isOpen) return null;

  const colorScheme = {
    danger: {
      bg: 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400',
      btn: 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/30',
    },
    warning: {
      bg: 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400',
      btn: 'bg-amber-700 hover:bg-amber-800 text-white shadow-amber-700/30',
    },
    info: {
      bg: 'bg-indigo-500/10 border-indigo-500/30 text-indigo-600 dark:text-indigo-400',
      btn: 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/30',
    },
  }[variant];

  return (
    <div 
      className="fixed inset-0 z-[200] bg-slate-950/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onCancel}
    >
      <div 
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        onClick={(e) => e.stopPropagation()}
        className="bg-surface text-ink border border-line rounded-card max-w-md w-full max-h-[90dvh] overflow-y-auto p-5 sm:p-6 shadow-overlay space-y-5 animate-in zoom-in-95 duration-200"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`p-2.5 rounded-xl border shrink-0 ${colorScheme.bg}`}>
              <AlertCircle className="w-6 h-6" aria-hidden="true" />
            </div>
            <div>
              <h3 id={titleId} className="text-lg font-bold text-ink break-words">{title}</h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="icon-btn -mr-2 -mt-1 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            title="Tutup (Esc)"
            aria-label="Tutup dialog konfirmasi"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <p id={messageId} className="text-sm text-ink-muted leading-relaxed">{message}</p>

        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-3 pt-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="min-h-touch px-4 py-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-semibold transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onCancel();
            }}
            className={`min-h-touch px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-md hover:scale-[1.02] active:scale-[0.98] ${colorScheme.btn}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
