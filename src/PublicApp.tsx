import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './components/ErrorBoundary';
import { PublicHospitalPortal } from './components/Portal/PublicHospitalPortal';
import { NotFoundPage } from './components/Portal/NotFoundPage';
import { OfflineIndicator } from './components/PWA/OfflineIndicator';

// Aplikasi mobile pasien (beserta Firebase Auth/Hospital provider) dimuat terpisah
// agar bundle halaman landing tetap kecil.
const PublicMobileRoute = lazy(() => import('./components/Portal/PublicMobileRoute'));

/** Indikator offline web publik; aplikasi pasien (/mobile/*) menampilkan banner offline sendiri. */
function PublicOfflineIndicator() {
  const { pathname } = useLocation();
  return <OfflineIndicator hidden={pathname === '/mobile' || pathname.startsWith('/mobile/')} />;
}

function RouteFallback() {
  return (
    <div role="status" aria-live="polite" className="min-h-screen flex items-center justify-center bg-slate-50">
      <span className="text-sm font-semibold text-slate-600">Memuat Aplikasi Pasien...</span>
    </div>
  );
}

// Web publik pasien: portal MYITARU + aplikasi mobile pasien.
// Tidak memuat modul SIMK/RME; aplikasi inti berjalan terpisah (lihat App.tsx).
// Web publik sengaja hanya mode terang (light-only); tidak ada kelas dark: di level halaman.
export default function PublicApp() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
          <Toaster position="top-right" />
          <PublicOfflineIndicator />
          <div className="flex-1 flex flex-col min-w-0 relative w-full">
            <Routes>
              <Route path="/" element={<ErrorBoundary><PublicHospitalPortal /></ErrorBoundary>} />
              <Route path="/portal" element={<ErrorBoundary><PublicHospitalPortal /></ErrorBoundary>} />
              <Route
                path="/mobile/*"
                element={
                  <ErrorBoundary>
                    <Suspense fallback={<RouteFallback />}>
                      <PublicMobileRoute />
                    </Suspense>
                  </ErrorBoundary>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </div>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
