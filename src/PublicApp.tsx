import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { HospitalProvider } from './contexts/HospitalContext';
import ErrorBoundary from './components/ErrorBoundary';
import { PublicHospitalPortal } from './components/Portal/PublicHospitalPortal';
import { PatientMobileApp } from './components/Mobile/PatientMobileApp';
import { OfflineIndicator } from './components/PWA/OfflineIndicator';

// Web publik pasien: portal MYITARU + aplikasi mobile pasien.
// Tidak memuat modul SIMK/RME; aplikasi inti berjalan terpisah (lihat App.tsx).
export default function PublicApp() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <HospitalProvider>
            <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50 font-sans flex flex-col">
              <Toaster position="top-right" />
              <OfflineIndicator />
              <main className="flex-1 flex flex-col min-w-0 relative w-full">
                <Routes>
                  <Route path="/" element={<ErrorBoundary><PublicHospitalPortal /></ErrorBoundary>} />
                  <Route path="/portal" element={<ErrorBoundary><PublicHospitalPortal /></ErrorBoundary>} />
                  <Route path="/mobile/*" element={<ErrorBoundary><PatientMobileApp /></ErrorBoundary>} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </main>
            </div>
          </HospitalProvider>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}
