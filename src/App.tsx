import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { HospitalProvider, useHospital } from './contexts/HospitalContext';
import { AuditTrailProvider } from './contexts/AuditTrailContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { WorkflowProvider } from './contexts/WorkflowContext';
import { PatientFlowProvider } from './contexts/PatientFlowContext';
import { KeyboardShortcutsProvider } from './contexts/KeyboardShortcutsContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider, useAuth } from './contexts/AuthContext';
const UserManagement = lazyNamed(() => import('./components/Auth/UserManagement'), 'UserManagement');
import { ProtectedRoute, withAuthorization } from './components/Auth/ProtectedRoute';
import Dashboard from './components/Dashboard';
import ModuleLayout from './layouts/ModuleLayout';
import { GenericModuleContent } from './components/GenericModuleContent';
import ErrorBoundary from './components/ErrorBoundary';
import { Login } from './components/Login';
const EmployeeAppLanding = lazyNamed(() => import('./components/Employee/EmployeeAppLanding'), 'EmployeeAppLanding');
const EmployeePortal = lazyNamed(() => import('./components/Employee/EmployeePortal'), 'EmployeePortal');
const EmployeeMobileApp = lazyNamed(() => import('./components/Employee/EmployeeMobileApp'), 'EmployeeMobileApp');
import { OfflineIndicator } from './components/PWA/OfflineIndicator';

// Existing Modules
// Tiap modul dimuat saat dibuka; sebelumnya semua modul (~6 MB) diunduh sebelum halaman login bisa dipakai.
function lazyNamed<M, K extends keyof M>(load: () => Promise<M>, name: K) {
  return React.lazy(async () => ({ default: (await load())[name] as React.ComponentType<any> }));
}

const Registration = lazyNamed(() => import('./components/Registration'), 'Registration');
const Emergency = lazyNamed(() => import('./components/Emergency'), 'Emergency');
const Outpatient = lazyNamed(() => import('./components/Outpatient'), 'Outpatient');
const BedManagement = lazyNamed(() => import('./components/BedManagement'), 'BedManagement');
const KamarOperasi = lazyNamed(() => import('./components/KamarOperasi'), 'KamarOperasi');
const Laboratorium = lazyNamed(() => import('./components/Laboratorium'), 'Laboratorium');
const RadiologiDashboard = lazyNamed(() => import('./components/Radiologi/RadiologiDashboard'), 'RadiologiDashboard');
const MedicalRecords = lazyNamed(() => import('./components/MedicalRecords'), 'MedicalRecords');
const ManajemenSDM = lazyNamed(() => import('./components/ManajemenSDM'), 'ManajemenSDM');
const InventoryManagement = lazyNamed(() => import('./components/InventoryManagement'), 'InventoryManagement');
const PatientFlowDashboard = React.lazy(() => import('./components/PatientFlowDashboard'));
const PatientSafety = lazyNamed(() => import('./components/Safety/PatientSafety'), 'PatientSafety');
const Pharmacy = lazyNamed(() => import('./components/Pharmacy'), 'Pharmacy');
const Billing = lazyNamed(() => import('./components/Billing'), 'Billing');
const BPJSModule = lazyNamed(() => import('./components/BPJS/BPJSModule'), 'BPJSModule');
const AnalyticsDashboard = React.lazy(() => import('./components/AnalyticsDashboard'));
const SatuSehatIntegration = lazyNamed(() => import('./components/SatuSehatIntegration'), 'SatuSehatIntegration');
const ApiManagementSystem = lazyNamed(() => import('./components/ApiManagement/ApiManagementSystem'), 'ApiManagementSystem');
const PanduanModule = lazyNamed(() => import('./components/Panduan/PanduanModule'), 'PanduanModule');
const NotificationPreferences = React.lazy(() => import('./components/NotificationPreferences'));
const Profile = lazyNamed(() => import('./components/Profile'), 'Profile');
const AuthManagement = lazyNamed(() => import('./components/Auth/AuthManagement'), 'AuthManagement');
const AuditTrail = React.lazy(() => import('./components/AuditTrail'));
const BackupManagement = lazyNamed(() => import('./components/Backup/BackupManagement'), 'BackupManagement');
const MonitoringSystem = lazyNamed(() => import('./components/Monitoring/MonitoringSystem'), 'MonitoringSystem');
const ModulTriase = React.lazy(() => import('./components/ModulTriase'));
const PengaturanRS = lazyNamed(() => import('./components/Settings/PengaturanRS'), 'PengaturanRS');
const JKNMobile = lazyNamed(() => import('./components/JKNMobile/JKNMobile'), 'JKNMobile');
import { AntrianProvider } from "./contexts/AntrianContext";
const PoliPelayanan = lazyNamed(() => import('./components/Poli/PoliPelayanan'), 'PoliPelayanan');
const DisplayAntrianPoli = lazyNamed(() => import('./components/Poli/DisplayAntrianPoli'), 'DisplayAntrianPoli');
import CommandPalette from './components/CommandPalette';
const ICUMonitoring = lazyNamed(() => import('./components/ICU/ICUMonitoring'), 'ICUMonitoring');
const RehabMedik = lazyNamed(() => import('./components/Rehab/RehabMedik'), 'RehabMedik');
const GiziDiet = lazyNamed(() => import('./components/Gizi/GiziDiet'), 'GiziDiet');
const Telemedicine = lazyNamed(() => import('./components/Telemed/Telemedicine'), 'Telemedicine');
const PatientPortal = lazyNamed(() => import('./components/Portal/PatientPortal'), 'PatientPortal');
const MultiBranchSystem = React.lazy(() => import('./components/MultiBranch/MultiBranchSystem'));
const CRMManagement = lazyNamed(() => import('./components/CRM/CRMManagement'), 'CRMManagement');
const BlueprintSystemView = lazyNamed(() => import('./components/Blueprint/BlueprintSystemView'), 'BlueprintSystemView');

// Bridging Modules
const BridgingHub = lazyNamed(() => import('./components/Bridging/BridgingHub'), 'BridgingHub');
const VClaimBridging = lazyNamed(() => import('./components/Bridging/VClaimBridging'), 'VClaimBridging');
const SatuSehatBridging = lazyNamed(() => import('./components/Bridging/SatuSehatBridging'), 'SatuSehatBridging');
const WAGatewayBridging = lazyNamed(() => import('./components/Bridging/WAGatewayBridging'), 'WAGatewayBridging');
const AnjunganBridging = lazyNamed(() => import('./components/Bridging/AnjunganBridging'), 'AnjunganBridging');
const HFISBridging = lazyNamed(() => import('./components/Bridging/HFISBridging'), 'HFISBridging');
const VedikaBridging = lazyNamed(() => import('./components/Bridging/VedikaBridging'), 'VedikaBridging');
const VeronisaBridging = lazyNamed(() => import('./components/Bridging/VeronisaBridging'), 'VeronisaBridging');
const BPJSEMRBridging = lazyNamed(() => import('./components/Bridging/BPJSEMRBridging'), 'BPJSEMRBridging');
const SertisignBridging = lazyNamed(() => import('./components/Bridging/SertisignBridging'), 'SertisignBridging');
const OrthancBridging = lazyNamed(() => import('./components/Bridging/OrthancBridging'), 'OrthancBridging');
const ApiGatewayBridging = lazyNamed(() => import('./components/Bridging/ApiGatewayBridging'), 'ApiGatewayBridging');
const CloudflareBridging = lazyNamed(() => import('./components/Bridging/CloudflareBridging'), 'CloudflareBridging');

function AppContent() {
  const { currentUser, logout, loading } = useAuth();
  const { isDarkMode } = useHospital();

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    const handleViewerBlock = () => {
      toast.error('Akun Google (Viewer Mode) tidak memiliki izin untuk menyimpan data.', {
        id: 'viewer-block-toast',
      });
    };
    window.addEventListener('viewer-mode-block', handleViewerBlock);
    return () => window.removeEventListener('viewer-mode-block', handleViewerBlock);
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-slate-50 font-sans transition-colors duration-300 flex flex-col">
      <Toaster position="top-right" />
      <OfflineIndicator />
      {currentUser && <CommandPalette />}

      <main className="flex-1 flex flex-col min-w-0 relative w-full scroll-smooth">
        <ErrorBoundary>
          <React.Suspense fallback={<div className="flex-1 flex items-center justify-center p-10"><div className="w-10 h-10 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" role="status" aria-label="Memuat modul" /></div>}>
          <Routes>
            {/* 1. Portal Publik Pasien & App Mobile Pasien dipisah ke aplikasi web publik (PublicApp.tsx / public.html) */}
            <Route path="/" element={<Navigate to={currentUser ? '/dashboard' : '/staff/login'} replace />} />

            {/* 2. Aplikasi Karyawan (HRIS & 34 Divisi, App Download Landing & Mobile Karyawan) */}
            <Route path="/portal-karyawan" element={<ErrorBoundary><EmployeePortal /></ErrorBoundary>} />
            <Route path="/portal-karyawan/*" element={<ErrorBoundary><EmployeePortal /></ErrorBoundary>} />
            <Route path="/karyawan/login" element={<Navigate to="/portal-karyawan" replace />} />
            <Route path="/app-karyawan" element={<ErrorBoundary><EmployeeAppLanding /></ErrorBoundary>} />
            <Route path="/app" element={<ErrorBoundary><EmployeeAppLanding /></ErrorBoundary>} />
            <Route path="/karyawan/mobile/*" element={<ErrorBoundary><EmployeeMobileApp /></ErrorBoundary>} />

            {/* 3. Aplikasi Inti / Staf (MYITARU SIMK & RME Klinis) */}
            <Route
              path="/staff/login"
              element={
                loading ? (
                  <div className="min-h-screen bg-[#07265C] flex flex-col items-center justify-center p-4">
                    <div className="w-12 h-12 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-white font-semibold text-sm">Memverifikasi Sesi Keamanan SIMK...</p>
                  </div>
                ) : currentUser ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <ErrorBoundary><Login /></ErrorBoundary>
                )
              }
            />
            <Route
              path="/staff/login/*"
              element={
                currentUser ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <ErrorBoundary><Login /></ErrorBoundary>
                )
              }
            />
            <Route
              path="/dashboard"
              element={
                loading ? (
                  <div className="min-h-screen bg-[#07265C] flex flex-col items-center justify-center p-4">
                    <div className="w-12 h-12 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-white font-semibold text-sm">Memuat Dasbor SIMK...</p>
                  </div>
                ) : currentUser ? (
                  <Dashboard />
                ) : (
                  <Navigate to="/staff/login" replace />
                )
              }
            />
            <Route
              path="/modul"
              element={
                // Tunggu sesi selesai dimuat; tanpa ini refresh/tautan langsung ke modul terlempar ke login lalu dasbor.
                loading ? (
                  <div className="min-h-screen bg-[#07265C] flex flex-col items-center justify-center p-4">
                    <div className="w-12 h-12 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mb-4" />
                    <p className="text-white font-semibold text-sm">Memuat Modul SIMK...</p>
                  </div>
                ) : currentUser ? (
                  <ModuleLayout />
                ) : (
                  <Navigate to="/staff/login" replace />
                )
              }
            >
              <Route path="pendaftaran" element={<ErrorBoundary><ProtectedRoute moduleId="pendaftaran"><Registration /></ProtectedRoute></ErrorBoundary>} />
              <Route path="rekam-medis" element={<ErrorBoundary><ProtectedRoute moduleId="rekam-medis"><MedicalRecords /></ProtectedRoute></ErrorBoundary>} />
              <Route path="igd" element={<ErrorBoundary><ProtectedRoute moduleId="igd"><Emergency /></ProtectedRoute></ErrorBoundary>} />
              <Route path="rawat-jalan" element={<ErrorBoundary><ProtectedRoute moduleId="rawat-jalan"><Outpatient /></ProtectedRoute></ErrorBoundary>} />
              <Route path="patient-flow" element={<ErrorBoundary><ProtectedRoute moduleId="rawat-jalan"><PatientFlowDashboard /></ProtectedRoute></ErrorBoundary>} />
              <Route path="rawat-inap" element={<ErrorBoundary><ProtectedRoute moduleId="rawat-inap"><BedManagement /></ProtectedRoute></ErrorBoundary>} />
              <Route path="operasi" element={<ErrorBoundary><ProtectedRoute moduleId="operasi"><KamarOperasi /></ProtectedRoute></ErrorBoundary>} />
              <Route path="laboratorium" element={<ErrorBoundary><ProtectedRoute moduleId="laboratorium"><Laboratorium /></ProtectedRoute></ErrorBoundary>} />
              <Route path="radiologi" element={<ErrorBoundary><ProtectedRoute moduleId="radiologi"><RadiologiDashboard /></ProtectedRoute></ErrorBoundary>} />
              
              {/* Bridging Modules */}
              <Route path="bridging-hub" element={<ErrorBoundary><ProtectedRoute moduleId="bridging-hub"><BridgingHub /></ProtectedRoute></ErrorBoundary>} />
              <Route path="wa-gateway" element={<ErrorBoundary><ProtectedRoute moduleId="wa-gateway"><WAGatewayBridging /></ProtectedRoute></ErrorBoundary>} />
              <Route path="anjungan" element={<ErrorBoundary><ProtectedRoute moduleId="anjungan"><AnjunganBridging /></ProtectedRoute></ErrorBoundary>} />
              <Route path="api" element={<ErrorBoundary><ProtectedRoute moduleId="api"><ApiGatewayBridging /></ProtectedRoute></ErrorBoundary>} />
              <Route path="vclaim" element={<ErrorBoundary><ProtectedRoute moduleId="vclaim"><VClaimBridging /></ProtectedRoute></ErrorBoundary>} />
              <Route path="vedika" element={<ErrorBoundary><ProtectedRoute moduleId="vedika"><VedikaBridging /></ProtectedRoute></ErrorBoundary>} />
              <Route path="orthanc" element={<ErrorBoundary><ProtectedRoute moduleId="orthanc"><OrthancBridging /></ProtectedRoute></ErrorBoundary>} />
              <Route path="bpjs-emr" element={<ErrorBoundary><ProtectedRoute moduleId="bpjs-emr"><BPJSEMRBridging /></ProtectedRoute></ErrorBoundary>} />
              <Route path="hfis" element={<ErrorBoundary><ProtectedRoute moduleId="hfis"><HFISBridging /></ProtectedRoute></ErrorBoundary>} />
              <Route path="veronisa" element={<ErrorBoundary><ProtectedRoute moduleId="veronisa"><VeronisaBridging /></ProtectedRoute></ErrorBoundary>} />
              <Route path="satu-sehat" element={<ErrorBoundary><ProtectedRoute moduleId="satu-sehat"><SatuSehatBridging /></ProtectedRoute></ErrorBoundary>} />
              <Route path="sertisign" element={<ErrorBoundary><ProtectedRoute moduleId="sertisign"><SertisignBridging /></ProtectedRoute></ErrorBoundary>} />
              <Route path="cloudflare" element={<ErrorBoundary><ProtectedRoute moduleId="cloudflare"><CloudflareBridging /></ProtectedRoute></ErrorBoundary>} />
              
              <Route path="sdm" element={<ErrorBoundary><ProtectedRoute moduleId="sdm"><ManajemenSDM /></ProtectedRoute></ErrorBoundary>} />
              <Route path="inventory" element={<ErrorBoundary><ProtectedRoute moduleId="inventory"><InventoryManagement /></ProtectedRoute></ErrorBoundary>} />
              <Route path="mutu" element={<ErrorBoundary><ProtectedRoute moduleId="mutu"><PatientSafety /></ProtectedRoute></ErrorBoundary>} />
              <Route path="apotek-ralan" element={<ErrorBoundary><ProtectedRoute moduleId="apotek-ralan"><Pharmacy /></ProtectedRoute></ErrorBoundary>} />
              <Route path="apotek-ranap" element={<ErrorBoundary><ProtectedRoute moduleId="apotek-ranap"><Pharmacy /></ProtectedRoute></ErrorBoundary>} />
              <Route path="stok-obat" element={<ErrorBoundary><ProtectedRoute moduleId="stok-obat"><Pharmacy /></ProtectedRoute></ErrorBoundary>} />
              <Route path="kasir" element={<ErrorBoundary><ProtectedRoute moduleId="kasir"><Billing /></ProtectedRoute></ErrorBoundary>} />
              <Route path="bpjs-klaim" element={<ErrorBoundary><ProtectedRoute moduleId="bpjs-klaim"><BPJSModule /></ProtectedRoute></ErrorBoundary>} />
              <Route path="laporan" element={<ErrorBoundary><ProtectedRoute moduleId="laporan"><AnalyticsDashboard /></ProtectedRoute></ErrorBoundary>} />
              <Route path="bpjs" element={<ErrorBoundary><ProtectedRoute moduleId="vclaim"><BPJSModule /></ProtectedRoute></ErrorBoundary>} />
              <Route path="kemenkes" element={<ErrorBoundary><ProtectedRoute moduleId="satu-sehat"><SatuSehatIntegration /></ProtectedRoute></ErrorBoundary>} />
              <Route path="integrasi" element={<ErrorBoundary><ProtectedRoute moduleId="api"><ApiManagementSystem /></ProtectedRoute></ErrorBoundary>} />
              <Route path="blueprint" element={<ErrorBoundary><BlueprintSystemView /></ErrorBoundary>} />
              <Route path="panduan" element={<ErrorBoundary><ProtectedRoute moduleId="panduan"><PanduanModule /></ProtectedRoute></ErrorBoundary>} />
              <Route path="pengaturan-klinik" element={<ErrorBoundary><ProtectedRoute moduleId="pengaturan-klinik"><PengaturanRS /></ProtectedRoute></ErrorBoundary>} />
              <Route path="notifikasi" element={<ErrorBoundary><ProtectedRoute moduleId="notifikasi"><NotificationPreferences /></ProtectedRoute></ErrorBoundary>} />
              <Route path="profile" element={<ErrorBoundary><ProtectedRoute moduleId="profile"><Profile /></ProtectedRoute></ErrorBoundary>} />
              
              {/* Sensitive System & Security Routes */}
              <Route path="security" element={<ErrorBoundary><ProtectedRoute moduleId="security" allowedRoles={['super_admin', 'admin', 'it_support']}><AuthManagement /></ProtectedRoute></ErrorBoundary>} />
              <Route path="audit" element={<ErrorBoundary><ProtectedRoute moduleId="audit"><AuditTrail /></ProtectedRoute></ErrorBoundary>} />
              <Route path="backup" element={<ErrorBoundary><ProtectedRoute moduleId="backup" allowedRoles={['super_admin', 'admin', 'it_support']}><BackupManagement /></ProtectedRoute></ErrorBoundary>} />
              <Route path="monitoring" element={<ErrorBoundary><ProtectedRoute moduleId="monitoring" allowedRoles={['super_admin', 'admin', 'it_support', 'direksi']}><MonitoringSystem /></ProtectedRoute></ErrorBoundary>} />
              <Route path="user-management" element={<ErrorBoundary><ProtectedRoute moduleId="security" allowedRoles={['super_admin', 'admin', 'it_support']}><UserManagement /></ProtectedRoute></ErrorBoundary>} />

              <Route path="triase" element={<ErrorBoundary><ProtectedRoute moduleId="triase"><ModulTriase /></ProtectedRoute></ErrorBoundary>} />
              <Route path="jkn-mobile" element={<ErrorBoundary><ProtectedRoute moduleId="jkn-mobile"><JKNMobile /></ProtectedRoute></ErrorBoundary>} />
              <Route path="poli" element={<ErrorBoundary><ProtectedRoute moduleId="rawat-jalan"><PoliPelayanan /></ProtectedRoute></ErrorBoundary>} />
              <Route path="display-antrian" element={<ErrorBoundary><ProtectedRoute moduleId="pendaftaran"><DisplayAntrianPoli /></ProtectedRoute></ErrorBoundary>} />
              
              {/* Clinical & Patient Engagement Modules */}
              <Route path="icu" element={<ErrorBoundary><ProtectedRoute moduleId="rawat-inap"><ICUMonitoring /></ProtectedRoute></ErrorBoundary>} />
              <Route path="rehab" element={<ErrorBoundary><ProtectedRoute moduleId="rawat-jalan"><RehabMedik /></ProtectedRoute></ErrorBoundary>} />
              <Route path="gizi" element={<ErrorBoundary><ProtectedRoute moduleId="rawat-inap"><GiziDiet /></ProtectedRoute></ErrorBoundary>} />
              <Route path="telemedicine" element={<ErrorBoundary><ProtectedRoute moduleId="rawat-jalan"><Telemedicine /></ProtectedRoute></ErrorBoundary>} />
              <Route path="patient-portal" element={<ErrorBoundary><ProtectedRoute moduleId="pendaftaran"><PatientPortal /></ProtectedRoute></ErrorBoundary>} />
              <Route path="multi-branch" element={<ErrorBoundary><ProtectedRoute moduleId="pengaturan-klinik"><MultiBranchSystem /></ProtectedRoute></ErrorBoundary>} />
              <Route path="crm" element={<ErrorBoundary><ProtectedRoute moduleId="pendaftaran"><CRMManagement /></ProtectedRoute></ErrorBoundary>} />

              <Route path=":moduleId" element={<ErrorBoundary><GenericModuleContent /></ErrorBoundary>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </React.Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <BrowserRouter>
          <HospitalProvider>
            <AntrianProvider>
              <ToastProvider>
                <NotificationProvider>
                  <AuditTrailProvider>
                    <WorkflowProvider>
                      <PatientFlowProvider>
                        <KeyboardShortcutsProvider>
                          <ErrorBoundary>
                            <AppContent />
                          </ErrorBoundary>
                        </KeyboardShortcutsProvider>
                      </PatientFlowProvider>
                    </WorkflowProvider>
                  </AuditTrailProvider>
                </NotificationProvider>
              </ToastProvider>
            </AntrianProvider>
          </HospitalProvider>
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

export default App;
