import React, { useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { TopInfoBar } from './sections/TopInfoBar';
import { SiteHeader, type PortalNavItem } from './sections/SiteHeader';
import { SiteFooter } from './sections/SiteFooter';
import { SUBPAGE_NAV_ITEMS } from './publicNav';

interface Crumb {
  label: string;
  to?: string;
}

interface PublicPageLayoutProps {
  /** Judul halaman (h1). */
  title: string;
  eyebrow?: string;
  intro?: React.ReactNode;
  breadcrumbs?: Crumb[];
  children: React.ReactNode;
  /** Lebar konten: 'prose' untuk teks panjang (legal/artikel), 'wide' untuk direktori. */
  width?: 'prose' | 'wide';
}

/** Kerangka halaman publik selain beranda: header, breadcrumb, h1, konten, footer. */
export const PublicPageLayout: React.FC<PublicPageLayoutProps> = ({
  title,
  eyebrow,
  intro,
  breadcrumbs = [],
  children,
  width = 'prose'
}) => {
  const navigate = useNavigate();
  const handleNavigate = useCallback(
    (item: PortalNavItem) => {
      if (item.to || !item.target) return;
      navigate(`/#${item.target}`);
    },
    [navigate]
  );
  const container = width === 'wide' ? 'max-w-7xl' : 'max-w-3xl';

  return (
    <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col">
      <a
        href="#konten-utama"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-white focus:text-brand focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg"
      >
        Lewati ke konten utama
      </a>
      <TopInfoBar />
      <SiteHeader navItems={SUBPAGE_NAV_ITEMS} onNavigate={handleNavigate} onSubpage />

      <main id="konten-utama" tabIndex={-1} className="flex-1 outline-none">
        <div className="bg-slate-50 border-b border-slate-200">
          <div className={`${container} mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 space-y-3`}>
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1 text-xs font-semibold text-slate-600">
                <li>
                  <Link to="/" className="hover:text-brand underline-offset-2 hover:underline rounded">
                    Beranda
                  </Link>
                </li>
                {breadcrumbs.map((c, i) => (
                  <li key={`${c.label}-${i}`} className="inline-flex items-center gap-1">
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400" aria-hidden="true" />
                    {c.to ? (
                      <Link to={c.to} className="hover:text-brand underline-offset-2 hover:underline rounded">
                        {c.label}
                      </Link>
                    ) : (
                      <span aria-current="page" className="text-slate-800">
                        {c.label}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
            {eyebrow && <p className="text-xs font-bold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 text-balance leading-tight">
              {title}
            </h1>
            {intro && <div className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-3xl">{intro}</div>}
          </div>
        </div>
        <div className={`${container} mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12`}>{children}</div>
      </main>

      <SiteFooter navItems={SUBPAGE_NAV_ITEMS} onNavigate={handleNavigate} onSubpage />
    </div>
  );
};

/** Section teks panjang dengan h2 bernomor/berid (untuk daftar isi). */
export const ProseSection: React.FC<{ id: string; title: string; children: React.ReactNode }> = ({
  id,
  title,
  children
}) => (
  <section aria-labelledby={`${id}-title`} id={id} className="scroll-mt-24 space-y-3">
    <h2 id={`${id}-title`} className="text-lg sm:text-xl font-extrabold text-slate-900">
      {title}
    </h2>
    <div className="space-y-3 text-sm sm:text-base text-slate-700 leading-relaxed [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1.5">
      {children}
    </div>
  </section>
);

/** Daftar isi sederhana untuk halaman panjang. */
export const TableOfContents: React.FC<{ items: Array<{ id: string; title: string }> }> = ({ items }) => (
  <nav aria-label="Daftar isi" className="rounded-2xl border border-slate-200 bg-slate-50 p-5 mb-10">
    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-3">Daftar Isi</h2>
    <ol className="list-decimal pl-5 space-y-1.5 text-sm">
      {items.map((it) => (
        <li key={it.id}>
          <a href={`#${it.id}`} className="text-brand font-semibold underline-offset-2 hover:underline rounded">
            {it.title}
          </a>
        </li>
      ))}
    </ol>
  </nav>
);

/** Kotak info "belum dikonfigurasi" yang netral (tanpa data karangan). */
export const ContactFallback: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
    {children ?? 'Informasi kontak resmi sedang dilengkapi. Silakan hubungi bagian informasi/pendaftaran rumah sakit secara langsung.'}
  </p>
);

export default PublicPageLayout;
