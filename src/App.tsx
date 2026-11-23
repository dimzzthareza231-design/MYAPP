import React, { Suspense, lazy, useEffect } from 'react';
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
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import ModuleLayout from './layouts/ModuleLayout';
import { GenericModuleContent } from './components/GenericModuleContent';
import ErrorBoundary from './components/ErrorBoundary';
import { Login } from './components/Login';
import { OfflineIndicator } from './components/PWA/OfflineIndicator';
import CommandPalette from './components/CommandPalette';
import { AntrianProvider } from './contexts/AntrianContext';

// Route-level code splitting: setiap modul dimuat sebagai chunk terpisah saat rutenya dibuka,
// sehingga bundle awal tidak memuat seluruh aplikasi.
function lazyPage(loader: () => Promise<{ default: React.ComponentType<any> }>) {
  const LazyComponent = lazy(loader);
  return function LazyPage(props: Record<string, unknown>) {
    return (
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-10 h-10 border-4 border-sky-400 border-t-transparent rounded-full animate-spin" />
          </div>
        }
      >
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}

const Dashboard = lazyPage(() => import('./components/Dashboard'));
const UserManagement = lazyPage(() => import('./components/Auth/UserManagement').then((m) => ({ default: m.UserManagement })));

const EmployeeAppLanding = lazyPage(() => import('./components/Employee/EmployeeAppLanding').then((m) => ({ default: m.EmployeeAppLanding })));
const EmployeePortal = lazyPage(() => import('./components/Employee/EmployeePortal').then((m) => ({ default: m.EmployeePortal })));
const EmployeeMobileApp = lazyPage(() => import('./components/Employee/EmployeeMobileApp').then((m) => ({ default: m.EmployeeMobileApp })));

// Existing Modules
const Registration = lazyPage(() => import('./components/Registration').then((m) => ({ default: m.Registration })));
const Emergency = lazyPage(() => import('./components/Emergency').then((m) => ({ default: m.Emergency })));
const Outpatient = lazyPage(() => import('./components/Outpatient').then((m) => ({ default: m.Outpatient })));
const BedManagement = lazyPage(() => import('./components/BedManagement').then((m) => ({ default: m.BedManagement })));
const KamarOperasi = lazyPage(() => import('./components/KamarOperasi').then((m) => ({ default: m.KamarOperasi })));
const Laboratorium = lazyPage(() => import('./components/Laboratorium').then((m) => ({ default: m.Laboratorium })));
const RadiologiDashboard = lazyPage(() => import('./components/Radiologi/RadiologiDashboard').then((m) => ({ default: m.RadiologiDashboard })));
const MedicalRecords = lazyPage(() => import('./components/MedicalRecords').then((m) => ({ default: m.MedicalRecords })));
const ManajemenSDM = lazyPage(() => import('./components/ManajemenSDM').then((m) => ({ default: m.ManajemenSDM })));
const InventoryManagement = lazyPage(() => import('./components/InventoryManagement').then((m) => ({ default: m.InventoryManagement })));
const PatientFlowDashboard = lazyPage(() => import('./components/PatientFlowDashboard'));
const PatientSafety = lazyPage(() => import('./components/Safety/PatientSafety').then((m) => ({ default: m.PatientSafety })));
const Pharmacy = lazyPage(() => import('./components/Pharmacy').then((m) => ({ default: m.Pharmacy })));
const Billing = lazyPage(() => import('./components/Billing').then((m) => ({ default: m.Billing })));
const BPJSModule = lazyPage(() => import('./components/BPJS/BPJSModule').then((m) => ({ default: m.BPJSModule })));
const AnalyticsDashboard = lazyPage(() => import('./components/AnalyticsDashboard'));
const SatuSehatIntegration = lazyPage(() => import('./components/SatuSehatIntegration').then((m) => ({ default: m.SatuSehatIntegration })));
const ApiManagementSystem = lazyPage(() => import('./components/ApiManagement/ApiManagementSystem').then((m) => ({ default: m.ApiManagementSystem })));
const PanduanModule = lazyPage(() => import('./components/Panduan/PanduanModule').then((m) => ({ default: m.PanduanModule })));
const NotificationPreferences = lazyPage(() => import('./components/NotificationPreferences'));
const Profile = lazyPage(() => import('./components/Profile').then((m) => ({ default: m.Profile })));
const AuthManagement = lazyPage(() => import('./components/Auth/AuthManagement').then((m) => ({ default: m.AuthManagement })));
const AuditTrail = lazyPage(() => import('./components/AuditTrail'));
const BackupManagement = lazyPage(() => import('./components/Backup/BackupManagement').then((m) => ({ default: m.BackupManagement })));
const MonitoringSystem = lazyPage(() => import('./components/Monitoring/MonitoringSystem').then((m) => ({ default: m.MonitoringSystem })));
const ModulTriase = lazyPage(() => import('./components/ModulTriase'));
const PengaturanRS = lazyPage(() => import('./components/Settings/PengaturanRS').then((m) => ({ default: m.PengaturanRS })));
const JKNMobile = lazyPage(() => import('./components/JKNMobile/JKNMobile').then((m) => ({ default: m.JKNMobile })));
const PoliPelayanan = lazyPage(() => import('./components/Poli/PoliPelayanan').then((m) => ({ default: m.PoliPelayanan })));
const DisplayAntrianPoli = lazyPage(() => import('./components/Poli/DisplayAntrianPoli').then((m) => ({ default: m.DisplayAntrianPoli })));
const ICUMonitoring = lazyPage(() => import('./components/ICU/ICUMonitoring').then((m) => ({ default: m.ICUMonitoring })));
const RehabMedik = lazyPage(() => import('./components/Rehab/RehabMedik').then((m) => ({ default: m.RehabMedik })));
const GiziDiet = lazyPage(() => import('./components/Gizi/GiziDiet').then((m) => ({ default: m.GiziDiet })));
const Telemedicine = lazyPage(() => import('./components/Telemed/Telemedicine').then((m) => ({ default: m.Telemedicine })));
const PatientPortal = lazyPage(() => import('./components/Portal/PatientPortal').then((m) => ({ default: m.PatientPortal })));
const MultiBranchSystem = lazyPage(() => import('./components/MultiBranch/MultiBranchSystem'));
const CRMManagement = lazyPage(() => import('./components/CRM/CRMManagement').then((m) => ({ default: m.CRMManagement })));
const BlueprintSystemView = lazyPage(() => import('./components/Blueprint/BlueprintSystemView').then((m) => ({ default: m.BlueprintSystemView })));

// Bridging Modules
const BridgingHub = lazyPage(() => import('./components/Bridging/BridgingHub').then((m) => ({ default: m.BridgingHub })));
const VClaimBridging = lazyPage(() => import('./components/Bridging/VClaimBridging').then((m) => ({ default: m.VClaimBridging })));
const SatuSehatBridging = lazyPage(() => import('./components/Bridging/SatuSehatBridging').then((m) => ({ default: m.SatuSehatBridging })));
const WAGatewayBridging = lazyPage(() => import('./components/Bridging/WAGatewayBridging').then((m) => ({ default: m.WAGatewayBridging })));
const AnjunganBridging = lazyPage(() => import('./components/Bridging/AnjunganBridging').then((m) => ({ default: m.AnjunganBridging })));
const HFISBridging = lazyPage(() => import('./components/Bridging/HFISBridging').then((m) => ({ default: m.HFISBridging })));
const VedikaBridging = lazyPage(() => import('./components/Bridging/VedikaBridging').then((m) => ({ default: m.VedikaBridging })));
const VeronisaBridging = lazyPage(() => import('./components/Bridging/VeronisaBridging').then((m) => ({ default: m.VeronisaBridging })));
const BPJSEMRBridging = lazyPage(() => import('./components/Bridging/BPJSEMRBridging').then((m) => ({ default: m.BPJSEMRBridging })));
const SertisignBridging = lazyPage(() => import('./components/Bridging/SertisignBridging').then((m) => ({ default: m.SertisignBridging })));
const OrthancBridging = lazyPage(() => import('./components/Bridging/OrthancBridging').then((m) => ({ default: m.OrthancBridging })));
const ApiGatewayBridging = lazyPage(() => import('./components/Bridging/ApiGatewayBridging').then((m) => ({ default: m.ApiGatewayBridging })));
const CloudflareBridging = lazyPage(() => import('./components/Bridging/CloudflareBridging').then((m) => ({ default: m.CloudflareBridging })));

function AppContent() {
  const { currentUser, loading } = useAuth();
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
    <div className="min-h-screen bg-canvas text-ink font-sans transition-colors duration-300 flex flex-col">
      {currentUser && (
        <a href="#main-content" className="skip-link">Lewati ke konten utama</a>
      )}
      <Toaster position="top-right" />
      <OfflineIndicator />
      {currentUser && <CommandPalette />}

      {/* Wrapper rute (bukan <main>): tiap halaman merender <main id="main-content"> sendiri. */}
      <div className="flex-1 flex flex-col min-w-0 relative w-full">
        <ErrorBoundary>
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
                  <div role="status" aria-live="polite" className="min-h-screen bg-[#07265C] flex flex-col items-center justify-center p-4">
                    <div aria-hidden="true" className="w-12 h-12 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mb-4" />
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
                  <div role="status" aria-live="polite" className="min-h-screen bg-[#07265C] flex flex-col items-center justify-center p-4">
                    <div aria-hidden="true" className="w-12 h-12 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mb-4" />
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
                  <div role="status" aria-live="polite" className="min-h-screen bg-[#07265C] flex flex-col items-center justify-center p-4">
                    <div aria-hidden="true" className="w-12 h-12 border-4 border-sky-400 border-t-transparent rounded-full animate-spin mb-4" />
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
        </ErrorBoundary>
      </div>
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
