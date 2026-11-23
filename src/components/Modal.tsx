import React, { ReactNode, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  maxWidth?: string;
  footer?: ReactNode;
  icon?: ReactNode;
  subtitle?: string;
  variant?: 'default' | 'add' | 'edit' | 'danger' | 'detail';
  badgeText?: string;
}

export function Modal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  size = 'md', 
  maxWidth, 
  footer, 
  icon, 
  subtitle,
  variant = 'default',
  badgeText
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const subtitleId = useId();
  useDialogA11y(isOpen, onClose, dialogRef);

  if (!isOpen) return null;

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-2xl',
    lg: 'max-w-4xl',
    xl: 'max-w-6xl',
    full: 'max-w-[95vw]'
  };

  const widthClass = maxWidth || sizes[size];

  const variantStyles = {
    default: {
      headerBg: 'bg-slate-50/80 dark:bg-slate-800/90',
      iconBox: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    },
    add: {
      headerBg: 'bg-gradient-to-r from-blue-500/10 via-slate-50/80 to-slate-50/80 dark:via-slate-800/90 dark:to-slate-800/90',
      iconBox: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
      badge: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20'
    },
    edit: {
      headerBg: 'bg-gradient-to-r from-amber-500/10 via-slate-50/80 to-slate-50/80 dark:via-slate-800/90 dark:to-slate-800/90',
      iconBox: 'bg-amber-500/10 text-amber-500 border-amber-500/20',
      badge: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20'
    },
    danger: {
      headerBg: 'bg-gradient-to-r from-rose-500/10 via-slate-50/80 to-slate-50/80 dark:via-slate-800/90 dark:to-slate-800/90',
      iconBox: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
      badge: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20'
    },
    detail: {
      headerBg: 'bg-gradient-to-r from-cyan-500/10 via-slate-50/80 to-slate-50/80 dark:via-slate-800/90 dark:to-slate-800/90',
      iconBox: 'bg-cyan-500/10 text-cyan-500 border-cyan-500/20',
      badge: 'bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border-cyan-500/20'
    }
  };

  const currentVariant = variantStyles[variant] || variantStyles.default;

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/75 backdrop-blur-md transition-all animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? subtitleId : undefined}
        onClick={(e) => e.stopPropagation()}
        className={`relative bg-surface text-ink border border-line rounded-t-panel sm:rounded-card shadow-overlay w-full sm:max-w-[calc(100vw-2rem)] ${widthClass} flex flex-col max-h-[92dvh] sm:max-h-[90dvh] overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-200 outline-none`}
      >
        {/* MODAL HEADER */}
        <div className={`flex items-center justify-between gap-2 px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-200/80 dark:border-slate-700/80 ${currentVariant.headerBg} backdrop-blur-sm shrink-0`}>
          <div className="flex items-center gap-3 min-w-0">
            {icon && (
              <div className={`p-2 rounded-xl border flex items-center justify-center shrink-0 ${currentVariant.iconBox}`}>
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 id={titleId} className="text-base sm:text-lg font-bold text-ink leading-tight break-words">
                  {title}
                </h3>
                {badgeText && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${currentVariant.badge}`}>
                    {badgeText}
                  </span>
                )}
              </div>
              {subtitle && (
                <p id={subtitleId} className="text-xs text-ink-subtle mt-0.5 line-clamp-2">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="icon-btn text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
            title="Tutup (Esc)"
            aria-label="Tutup dialog"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* MODAL BODY */}
        <div className="p-4 sm:p-6 overflow-y-auto overscroll-contain custom-scrollbar flex-1 min-h-0 text-slate-800 dark:text-slate-200">
          {children}
        </div>

        {/* MODAL FOOTER */}
        {footer && (
          <div className="border-t border-slate-200/80 dark:border-slate-700/80 px-4 sm:px-5 py-3 sm:py-3.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3.5 bg-slate-50/90 dark:bg-slate-800/90 backdrop-blur-sm flex flex-wrap items-center justify-end gap-2.5 shrink-0">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}


