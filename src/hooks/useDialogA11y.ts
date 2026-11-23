import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  '[contenteditable="true"]',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Jumlah dialog yang sedang membuka scroll-lock. Dialog bisa bertumpuk
// (mis. ConfirmationModal di atas Modal), jadi body baru dibuka kuncinya
// saat dialog terakhir ditutup.
let scrollLockCount = 0;
let previousBodyOverflow = '';

function lockBodyScroll() {
  if (scrollLockCount === 0) {
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLockCount += 1;
}

function unlockBodyScroll() {
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if (scrollLockCount === 0) {
    document.body.style.overflow = previousBodyOverflow;
  }
}

function getFocusable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('inert') && el.getClientRects().length > 0,
  );
}

interface DialogA11yOptions {
  /** Kunci scroll body selama dialog terbuka (default: true). */
  lockScroll?: boolean;
  /** Elemen yang difokuskan pertama kali; default elemen fokusabel pertama di dialog. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * Perilaku aksesibilitas standar untuk dialog modal:
 * - Escape menutup dialog (hanya dialog paling atas yang merespons)
 * - Fokus dipindah ke dalam dialog saat dibuka dan dikembalikan saat ditutup
 * - Tab / Shift+Tab terkunci di dalam dialog (focus trap)
 * - Scroll body dikunci selama dialog terbuka
 */
export function useDialogA11y(
  isOpen: boolean,
  onClose: () => void,
  containerRef: RefObject<HTMLElement | null>,
  options: DialogA11yOptions = {},
) {
  const { lockScroll = true, initialFocusRef } = options;
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    if (lockScroll) lockBodyScroll();

    // Tunda satu frame agar konten dialog sudah ter-render sebelum fokus dipindah.
    const raf = requestAnimationFrame(() => {
      const container = containerRef.current;
      if (!container) return;
      if (container.contains(document.activeElement)) return; // mis. input autoFocus
      const target = initialFocusRef?.current ?? getFocusable(container)[0] ?? container;
      if (target === container && !container.hasAttribute('tabindex')) {
        container.setAttribute('tabindex', '-1');
      }
      target.focus({ preventScroll: true });
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      const container = containerRef.current;
      if (!container) return;

      // Hanya dialog teratas yang menangani keyboard ketika dialog bertumpuk.
      const dialogs = document.querySelectorAll('[aria-modal="true"]');
      const topMost = dialogs[dialogs.length - 1];
      if (topMost && topMost !== container && !container.contains(topMost)) return;

      if (e.key === 'Escape') {
        e.stopPropagation();
        e.preventDefault();
        onCloseRef.current();
        return;
      }

      if (e.key === 'Tab') {
        const focusable = getFocusable(container);
        if (focusable.length === 0) {
          e.preventDefault();
          container.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !container.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !container.contains(active))) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    // Fase capture agar Escape tidak ikut memicu handler global lain
    // (mis. ModuleLayout yang menavigasi ke dashboard saat Escape).
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown, true);
      if (lockScroll) unlockBodyScroll();
      if (previouslyFocused && typeof previouslyFocused.focus === 'function' && document.contains(previouslyFocused)) {
        previouslyFocused.focus({ preventScroll: true });
      }
    };
  }, [isOpen, lockScroll, containerRef, initialFocusRef]);
}
