import React from 'react';
import { AuthProvider } from '../../contexts/AuthContext';
import { HospitalProvider } from '../../contexts/HospitalContext';
import { PatientMobileApp } from '../Mobile/PatientMobileApp';

/**
 * Rute aplikasi mobile pasien, dimuat secara lazy dari PublicApp.
 * Provider Auth/Hospital (Firebase) hanya dibutuhkan aplikasi pasien, sehingga
 * ikut dipindah ke chunk ini agar tidak membebani halaman landing publik.
 */
const PublicMobileRoute: React.FC = () => (
  <AuthProvider>
    <HospitalProvider>
      <PatientMobileApp />
    </HospitalProvider>
  </AuthProvider>
);

export default PublicMobileRoute;
