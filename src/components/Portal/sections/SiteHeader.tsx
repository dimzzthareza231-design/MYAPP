import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { BrandLogo } from '../../Common/BrandLogo';
import { HOSPITAL_PROFILE } from '../../../data/hospitalPublicCatalog';
import { EASE_OUT_EXPO, SECTION_IDS, type WorkspaceMode } from '../portalShared';

export interface PortalNavItem {
  /** Id section tujuan (tanpa '#'). */
  target: string;
  label: string;
  /** Label lebih panjang untuk menu mobile. */
  mobileLabel?: string;
  /** Mode workspace yang diaktifkan saat tautan dipilih. */
  mode?: WorkspaceMode;
  /** Tampilkan di navigasi desktop (default true). */
  desktop?: boolean;
  /** Rute halaman (mis. "/dokter"); bila diisi, item dirender sebagai tautan rute, bukan jangkar. */
  to?: string;
}

interface SiteHeaderProps {
  navItems: PortalNavItem[];
  onNavigate: (item: PortalNavItem) => void;
  /** true di halaman selain beranda: jangkar diarahkan ke "/#id". */
  onSubpage?: boolean;
}

/** Tautan navigasi: rute (Link) atau jangkar section di beranda. */
export const PortalNavLink: React.FC<{
  item: PortalNavItem;
  onSubpage?: boolean;
  onNavigate: (item: PortalNavItem) => void;
  className?: string;
  children: React.ReactNode;
}> = ({ item, onSubpage, onNavigate, className, children }) => {
  if (item.to) {
    return (
      <Link to={item.to} onClick={() => onNavigate({ ...item, target: '' })} className={className}>
        {children}
      </Link>
    );
  }
  return (
    <a
      href={`${onSubpage ? '/' : ''}#${item.target}`}
      onClick={(e) => {
        if (onSubpage) e.preventDefault();
        onNavigate(item);
      }}
      className={className}
    >
      {children}
    </a>
  );
};

const MOBILE_MENU_ID = 'portal-mobile-menu';

export const SiteHeader: React.FC<SiteHeaderProps> = ({ navItems, onNavigate, onSubpage = false }) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileMenuOpen]);

  const handleItem = (item: PortalNavItem) => {
    setMobileMenuOpen(false);
    // Item rute ditangani <Link>; target kosong menandakan tidak perlu menggulir.
    if (item.target) onNavigate(item);
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-6">
        <Link
          to="/"
          onClick={() => {
            if (!onSubpage) window.scrollTo({ top: 0 });
          }}
          className="flex items-center gap-2.5 whitespace-nowrap shrink-0 rounded-lg"
        >
          <BrandLogo alt="" className="w-9 h-9 rounded-xl shadow-xs object-cover" />
          <span className="text-lg sm:text-xl font-extrabold tracking-tight text-brand">
            {HOSPITAL_PROFILE.name}
          </span>
          <span className="sr-only">— beranda</span>
        </Link>

        <nav aria-label="Navigasi utama" className="hidden lg:flex items-center gap-6 text-sm font-semibold text-slate-700">
          {navItems
            .filter((item) => item.desktop !== false)
            .map((item) => (
              <PortalNavLink
                key={`${item.to || item.target}-${item.label}`}
                item={item}
                onSubpage={onSubpage}
                onNavigate={handleItem}
                className="hover:text-brand transition whitespace-nowrap shrink-0 rounded"
              >
                {item.label}
              </PortalNavLink>
            ))}
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <PortalNavLink
            item={{ target: SECTION_IDS.bookingForm, label: 'Daftar Online', mode: 'daftar' }}
            onSubpage={onSubpage}
            onNavigate={handleItem}
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-xs transition whitespace-nowrap shrink-0 min-h-[44px]"
          >
            <CalendarCheck className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>Daftar Online</span>
          </PortalNavLink>

          <button
            type="button"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Tutup menu navigasi' : 'Buka menu navigasi'}
            aria-expanded={mobileMenuOpen}
            aria-controls={MOBILE_MENU_ID}
            className="lg:hidden p-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" aria-hidden="true" /> : <Menu className="w-5 h-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.nav
            id={MOBILE_MENU_ID}
            aria-label="Navigasi mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
            className="lg:hidden overflow-hidden bg-white border-t border-slate-200"
          >
            <ul className="px-4 py-4 space-y-1.5">
              {navItems.map((item) => (
                <li key={`m-${item.to || item.target}-${item.label}`}>
                  <PortalNavLink
                    item={item}
                    onSubpage={onSubpage}
                    onNavigate={(it) => {
                      setMobileMenuOpen(false);
                      if (it.target) onNavigate(it);
                    }}
                    className="block w-full px-3 py-3 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    {item.mobileLabel || item.label}
                  </PortalNavLink>
                </li>
              ))}
              <li>
                <Link
                  to="/mobile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="block w-full px-3 py-3 rounded-xl font-semibold text-brand bg-blue-50"
                >
                  Buka Aplikasi Pasien
                </Link>
              </li>
            </ul>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
};
