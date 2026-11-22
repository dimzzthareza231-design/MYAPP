import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import ErrorBoundary from './components/ErrorBoundary';
import { PublicHospitalPortal } from './components/Portal/PublicHospitalPortal';
import { NotFoundPage } from './components/Portal/NotFoundPage';
import { PublicFloatingActions } from './components/Portal/PublicFloatingActions';
import { OfflineIndicator } from './components/PWA/OfflineIndicator';

// Aplikasi mobile pasien (beserta Firebase Auth/Hospital provider) dimuat terpisah
// agar bundle halaman landing tetap kecil.
const PublicMobileRoute = lazy(() => import('./components/Portal/PublicMobileRoute'));

// Halaman informasi publik: masing-masing chunk terpisah (lazy).
const DoctorListPage = lazy(() => import('./components/Portal/pages/DoctorListPage'));
const DoctorProfilePage = lazy(() => import('./components/Portal/pages/DoctorProfilePage'));
const ArticleListPage = lazy(() => import('./components/Portal/pages/ArticleListPage'));
const ArticleDetailPage = lazy(() => import('./components/Portal/pages/ArticleDetailPage'));
const FaqPage = lazy(() => import('./components/Portal/pages/FaqPage'));
const PrivacyPolicyPage = lazy(() => import('./components/Portal/pages/PrivacyPolicyPage'));
const TermsPage = lazy(() => import('./components/Portal/pages/TermsPage'));
const PatientRightsPage = lazy(() => import('./components/Portal/pages/PatientRightsPage'));
const ComplaintPage = lazy(() => import('./components/Portal/pages/ComplaintPage'));
const BpjsPage = lazy(() => import('./components/Portal/pages/BpjsPage'));

function isMobileAppPath(pathname: string): boolean {
  return pathname === '/mobile' || pathname.startsWith('/mobile/');
}

/** Indikator offline web publik; aplikasi pasien (/mobile/*) menampilkan banner offline sendiri. */
function PublicOfflineIndicator() {
  const { pathname } = useLocation();
  return <OfflineIndicator hidden={isMobileAppPath(pathname)} />;
}

/** Gulir ke atas saat berpindah halaman (kecuali tautan ber-#jangkar yang ditangani halaman). */
function ScrollToTopOnRouteChange() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (!hash) window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
}

// Cincin fokus keyboard yang jelas untuk semua elemen interaktif web publik.
const FOCUS_RING =
  '[&_:is(a,button,summary,select,input,textarea):focus-visible]:outline-2 [&_:is(a,button,summary,select,input,textarea):focus-visible]:outline-offset-2 [&_:is(a,button,summary,select,input,textarea):focus-visible]:outline-brand';

/** WhatsApp, bar telepon IGD (mobile), dan pemberitahuan privasi; tidak tampil di aplikasi pasien. */
function PublicChrome({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const inMobileApp = isMobileAppPath(pathname);
  return (
    <div
      className={`flex-1 flex flex-col min-w-0 relative w-full ${
        // Ruang untuk bar "Telepon IGD" mobile agar konten terakhir/footer tidak tertutup.
        inMobileApp ? '' : `pb-[calc(3.75rem+env(safe-area-inset-bottom))] lg:pb-0 ${FOCUS_RING}`
      }`}
    >
      {children}
      {!inMobileApp && <PublicFloatingActions />}
    </div>
  );
}

function RouteFallback({ label = 'Memuat Aplikasi Pasien...' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="min-h-screen flex items-center justify-center bg-slate-50">
      <span className="text-sm font-semibold text-slate-600">{label}</span>
    </div>
  );
}

function page(element: React.ReactNode) {
  return (
    <ErrorBoundary>
      <Suspense fallback={<RouteFallback label="Memuat halaman..." />}>{element}</Suspense>
    </ErrorBoundary>
  );
}

// Web publik pasien: portal MYITARU + halaman informasi + aplikasi mobile pasien.
// Tidak memuat modul SIMK/RME; aplikasi inti berjalan terpisah (lihat App.tsx).
// Web publik sengaja hanya mode terang (light-only); tidak ada kelas dark: di level halaman.
// Rute statis baru juga harus ditambahkan ke PUBLIC_STATIC_ROUTES (publicDirectory.ts) & public/sitemap.xml.
export default function PublicApp() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <ScrollToTopOnRouteChange />
        <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col">
          <Toaster position="top-right" />
          <PublicOfflineIndicator />
          <PublicChrome>
            <Routes>
              <Route path="/" element={<ErrorBoundary><PublicHospitalPortal /></ErrorBoundary>} />
              <Route path="/portal" element={<ErrorBoundary><PublicHospitalPortal /></ErrorBoundary>} />
              <Route path="/dokter" element={page(<DoctorListPage />)} />
              <Route path="/dokter/:slug" element={page(<DoctorProfilePage />)} />
              <Route path="/artikel" element={page(<ArticleListPage />)} />
              <Route path="/artikel/:slug" element={page(<ArticleDetailPage />)} />
              <Route path="/faq" element={page(<FaqPage />)} />
              <Route path="/kebijakan-privasi" element={page(<PrivacyPolicyPage />)} />
              <Route path="/syarat-layanan" element={page(<TermsPage />)} />
              <Route path="/hak-pasien" element={page(<PatientRightsPage />)} />
              <Route path="/pengaduan" element={page(<ComplaintPage />)} />
              <Route path="/bpjs" element={page(<BpjsPage />)} />
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
          </PublicChrome>
        </div>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
