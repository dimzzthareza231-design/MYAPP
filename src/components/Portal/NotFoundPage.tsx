import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Home, Smartphone } from 'lucide-react';
import { BrandLogo } from '../Common/BrandLogo';
import { HOSPITAL_PROFILE } from '../../data/hospitalPublicCatalog';

/** Halaman 404 untuk web publik (menggantikan pengalihan diam-diam ke beranda). */
export const NotFoundPage: React.FC = () => {
  const location = useLocation();

  useEffect(() => {
    const prevTitle = document.title;
    document.title = `Halaman tidak ditemukan · ${HOSPITAL_PROFILE.name}`;
    // Cegah URL salah terindeks mesin pencari.
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    document.head.appendChild(meta);
    return () => {
      document.title = prevTitle;
      meta.remove();
    };
  }, []);

  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center space-y-6">
        <BrandLogo alt={HOSPITAL_PROFILE.name} className="w-14 h-14 rounded-2xl mx-auto object-cover" />
        <div className="space-y-2">
          <p className="text-sm font-bold text-brand tabular-nums">Error 404</p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">Halaman tidak ditemukan</h1>
          <p className="text-sm text-slate-600">
            Alamat <code className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-800 break-all">{location.pathname}</code>{' '}
            tidak tersedia. Periksa kembali tautan Anda atau kembali ke beranda.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 bg-brand hover:bg-brand-hover text-white font-bold px-5 py-3 rounded-xl min-h-[44px] text-sm"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>Kembali ke Beranda</span>
          </Link>
          <Link
            to="/mobile"
            className="inline-flex items-center justify-center gap-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold px-5 py-3 rounded-xl min-h-[44px] text-sm"
          >
            <Smartphone className="w-4 h-4 text-brand" aria-hidden="true" />
            <span>Buka Aplikasi Pasien</span>
          </Link>
        </div>
      </div>
    </main>
  );
};

export default NotFoundPage;
