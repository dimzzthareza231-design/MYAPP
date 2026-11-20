import React, { lazy, Suspense, type ComponentType, type ReactElement } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { HospitalProvider } from './contexts/HospitalContext';
import { AntrianProvider } from './contexts/AntrianContext';
import { AuditTrailProvider } from './contexts/AuditTrailContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { WorkflowProvider } from './contexts/WorkflowContext';
import { PatientFlowProvider } from './contexts/PatientFlowContext';
import { KeyboardShortcutsProvider } from './contexts/KeyboardShortcutsContext';
import { ToastProvider } from './contexts/ToastContext';
import { ProtectedRoute } from './components/Auth/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import { Login } from './components/Login';
const PatientAccount = lazy(() => import('../apps/main/src/PatientAccount'));
const Dashboard = lazy(() => import('./components/Dashboard'));
const ModuleLayout = lazy(() => import('./layouts/ModuleLayout'));
function named(loader: () => Promise<any>, name: string) { return lazy(async () => ({ default: (await loader())[name] as ComponentType<any> })); }
const Registration = named(() => import('./components/Registration'), 'Registration');
const MedicalRecords = named(() => import('./components/MedicalRecords'), 'MedicalRecords');
const Emergency = named(() => import('./components/Emergency'), 'Emergency');
const Outpatient = named(() => import('./components/Outpatient'), 'Outpatient');
const BedManagement = named(() => import('./components/BedManagement'), 'BedManagement');
const KamarOperasi = named(() => import('./components/KamarOperasi'), 'KamarOperasi');
const Laboratorium = named(() => import('./components/Laboratorium'), 'Laboratorium');
const RadiologiDashboard = named(() => import('./components/Radiologi/RadiologiDashboard'), 'RadiologiDashboard');
const Pharmacy = named(() => import('./components/Pharmacy'), 'Pharmacy');
const Billing = named(() => import('./components/Billing'), 'Billing');
const ManajemenSDM = named(() => import('./components/ManajemenSDM'), 'ManajemenSDM');
const InventoryManagement = named(() => import('./components/InventoryManagement'), 'InventoryManagement');
const PatientSafety = named(() => import('./components/Safety/PatientSafety'), 'PatientSafety');
const PengaturanRS = named(() => import('./components/Settings/PengaturanRS'), 'PengaturanRS');
const Profile = named(() => import('./components/Profile'), 'Profile');
const UserManagement = named(() => import('./components/Auth/UserManagement'), 'UserManagement');
const AnalyticsDashboard = lazy(() => import('./components/AnalyticsDashboard'));
const AuditTrail = lazy(() => import('./components/AuditTrail'));
const PoliPelayanan = named(() => import('./components/Poli/PoliPelayanan'), 'PoliPelayanan');
const DisplayAntrianPoli = named(() => import('./components/Poli/DisplayAntrianPoli'), 'DisplayAntrianPoli');
const ICUMonitoring = named(() => import('./components/ICU/ICUMonitoring'), 'ICUMonitoring');
const RehabMedik = named(() => import('./components/Rehab/RehabMedik'), 'RehabMedik');
const GiziDiet = named(() => import('./components/Gizi/GiziDiet'), 'GiziDiet');
const Loading = () => <p role="status" className="p-8">Memverifikasi sesi dan memuat aplikasi…</p>;
function Unavailable() { return <section className="p-8"><h1 className="text-xl font-bold">Modul belum diaktifkan</h1><p className="mt-3">Integrasi, backup, atau alur ini masih memerlukan implementasi dan verifikasi. Tidak ada transaksi eksternal atau backup yang dibuat. Tidak ada status sukses simulasi.</p></section>; }
function Gate({ children, staff = false }: { children: ReactElement; staff?: boolean }) {
  const { currentUser, loading } = useAuth();
  if (loading) return <Loading />;
  if (!currentUser?.aktif) return <Navigate to="/staff/login" replace />;
  if (staff && ['patient', 'viewer'].includes(currentUser.roleId)) return <Navigate to="/mobile" replace />;
  return children;
}
function LoginRoute() {
  const { currentUser, loading } = useAuth();
  return loading ? <Loading /> : currentUser ? <Navigate to={['patient', 'viewer'].includes(currentUser.roleId) ? '/mobile' : '/dashboard'} replace /> : <Login />;
}
const moduleRoutes: { path: string; id?: string; page: ReactElement; admin?: boolean }[] = [
  { path: 'pendaftaran', page: <Registration /> }, { path: 'rekam-medis', page: <MedicalRecords /> }, { path: 'igd', page: <Emergency /> },
  { path: 'rawat-jalan', page: <Outpatient /> }, { path: 'rawat-inap', page: <BedManagement /> }, { path: 'operasi', page: <KamarOperasi /> },
  { path: 'laboratorium', page: <Laboratorium /> }, { path: 'radiologi', page: <RadiologiDashboard /> }, { path: 'sdm', page: <ManajemenSDM /> },
  { path: 'inventory', page: <InventoryManagement /> }, { path: 'mutu', page: <PatientSafety /> },
  { path: 'apotek-ralan', page: <Pharmacy /> }, { path: 'apotek-ranap', page: <Pharmacy /> }, { path: 'stok-obat', page: <Pharmacy /> },
  { path: 'kasir', page: <Billing /> }, { path: 'laporan', page: <AnalyticsDashboard /> }, { path: 'profile', page: <Profile /> },
  { path: 'pengaturan-klinik', page: <PengaturanRS /> }, { path: 'audit', page: <AuditTrail /> },
  { path: 'user-management', id: 'security', page: <UserManagement />, admin: true },
  { path: 'poli', id: 'rawat-jalan', page: <PoliPelayanan /> }, { path: 'display-antrian', id: 'pendaftaran', page: <DisplayAntrianPoli /> },
  { path: 'icu', id: 'rawat-inap', page: <ICUMonitoring /> }, { path: 'rehab', id: 'rawat-jalan', page: <RehabMedik /> }, { path: 'gizi', id: 'rawat-inap', page: <GiziDiet /> },
];
function StaffRoutes() {
  return <><Toaster /><div role="note" className="bg-amber-50 text-amber-950 border-b p-3 text-sm">Tahap migrasi keamanan: modul lama masih memerlukan validasi alur dan persistensi. Jangan gunakan untuk data pasien nyata sebelum uji penerimaan selesai.</div><Routes>
    <Route path="/" element={<Navigate to="/dashboard" replace />} /><Route path="/dashboard" element={<Dashboard />} />
    <Route path="/modul" element={<ModuleLayout />}>{moduleRoutes.map(route => <Route key={route.path} path={route.path} element={<ProtectedRoute moduleId={route.id || route.path} requireAdmin={route.admin}>{route.page}</ProtectedRoute>} />)}<Route path="*" element={<Unavailable />} /></Route>
    <Route path="/portal-karyawan/*" element={<Navigate to="/dashboard" replace />} /><Route path="/karyawan/*" element={<Navigate to="/dashboard" replace />} /><Route path="/app-karyawan" element={<Navigate to="/dashboard" replace />} /><Route path="*" element={<Navigate to="/dashboard" replace />} />
  </Routes></>;
}
function StaffApp() {
  return <HospitalProvider><AntrianProvider><ToastProvider><NotificationProvider><AuditTrailProvider><WorkflowProvider><PatientFlowProvider><KeyboardShortcutsProvider><StaffRoutes /></KeyboardShortcutsProvider></PatientFlowProvider></WorkflowProvider></AuditTrailProvider></NotificationProvider></ToastProvider></AntrianProvider></HospitalProvider>;
}
export default function App() {
  return <ErrorBoundary><AuthProvider><BrowserRouter><Suspense fallback={<Loading />}><Routes>
    <Route path="/staff/login/*" element={<LoginRoute />} /><Route path="/mobile/*" element={<Gate><PatientAccount /></Gate>} />
    <Route path="/portal" element={<Navigate to="/staff/login" replace />} /><Route path="/*" element={<Gate staff><StaffApp /></Gate>} />
  </Routes></Suspense></BrowserRouter></AuthProvider></ErrorBoundary>;
}
