import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { signOut } from 'firebase/auth';
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../lib/firebase';
import { unregisterFcmForPatient, type PatientNotificationItem } from '../../lib/fcm';
import { useOnlineStatus } from '../PWA/OfflineIndicator';
import {
  MOBILE_BASE_PATH,
  SUBTAB_ORDER,
  TAB_ORDER,
  tabPath,
  type MobileTab,
  type PatientDossierPayload,
  type PublicDoctor,
  type ResultSubTab
} from './patient/types';
import { fadeSlideTransition, fadeSlideVariants, formatClock } from './patient/utils';
import { EmptyState } from './patient/ui';
import { useHospitalCatalog } from './patient/useHospitalCatalog';
import { usePatientNotifications } from './patient/usePatientNotifications';
import { LoginScreen } from './patient/LoginScreen';
import { AppHeader, BottomNav } from './patient/Navigation';
import { LiveAlertBanner } from './patient/LiveAlertBanner';
import { BerandaScreen } from './patient/BerandaScreen';
import { DOCTOR_PAGE_SIZE, JadwalScreen } from './patient/JadwalScreen';
import { HasilScreen } from './patient/HasilScreen';
import { TagihanScreen } from './patient/TagihanScreen';
import { QrCardModal } from './patient/QrCardModal';
import { BookingModal, type BookingRequest } from './patient/BookingModal';
import { NotificationsModal } from './patient/NotificationsModal';

const PATIENT_TOKEN_KEY = 'myitaru_patient_token';
const PATIENT_LOGIN_UNAVAILABLE_MESSAGE = 'Login pasien belum tersedia, hubungi pendaftaran.';

type DossierStatus = 'idle' | 'loading' | 'ready' | 'error';

function isMobileTab(value: string | undefined): value is MobileTab {
  return TAB_ORDER.includes(value as MobileTab);
}

function isResultSubTab(value: string | undefined): value is ResultSubTab {
  return SUBTAB_ORDER.includes(value as ResultSubTab);
}

/** Rute lama `/mobile?tab=hasil` (mis. dari notifikasi service worker) dialihkan ke rute baru. */
function legacyTabRedirect(search: string): string {
  const tabParam = new URLSearchParams(search).get('tab') || undefined;
  if (tabParam === 'hasil') return tabPath('hasil', 'lab');
  if (isMobileTab(tabParam)) return tabPath(tabParam, tabParam === 'hasil' ? 'resume' : undefined);
  return tabPath('beranda');
}

function readHistoryIndex(): number {
  try {
    const idx = (window.history.state as { idx?: unknown } | null)?.idx;
    return typeof idx === 'number' ? idx : 0;
  } catch {
    return 0;
  }
}

export const PatientMobileApp: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { signInWithGoogle, loading: authLoading } = useAuth();
  const isOnline = useOnlineStatus();
  const catalog = useHospitalCatalog();

  // ── Rute: /mobile/<tab>[/<subtab>] ────────────────────────────────────────
  const segments = location.pathname
    .slice(MOBILE_BASE_PATH.length)
    .split('/')
    .filter(Boolean);
  const routeTab = segments[0];
  const routeSub = segments[1];
  const activeTab: MobileTab = isMobileTab(routeTab) ? routeTab : 'beranda';
  const resultSubTab: ResultSubTab = isResultSubTab(routeSub) ? routeSub : 'resume';
  const needsRedirect =
    !isMobileTab(routeTab) || (routeTab === 'hasil' && !isResultSubTab(routeSub)) || (routeTab !== 'hasil' && segments.length > 1);

  // Indeks riwayat saat aplikasi pertama kali dibuka: tombol kembali di header hanya
  // mundur selama masih di dalam aplikasi pasien, tidak keluar ke situs portal.
  const entryHistoryIdxRef = useRef<number>(readHistoryIndex());
  const canGoBackInApp = readHistoryIndex() > entryHistoryIdxRef.current;

  // Arah animasi antar-tab dihitung dari tab sebelumnya.
  const prevTabRef = useRef<MobileTab>(activeTab);
  const tabDirectionRef = useRef(1);
  if (prevTabRef.current !== activeTab) {
    tabDirectionRef.current = TAB_ORDER.indexOf(activeTab) >= TAB_ORDER.indexOf(prevTabRef.current) ? 1 : -1;
    prevTabRef.current = activeTab;
  }
  const prevSubRef = useRef<ResultSubTab>(resultSubTab);
  const subDirectionRef = useRef(1);
  if (prevSubRef.current !== resultSubTab) {
    subDirectionRef.current =
      SUBTAB_ORDER.indexOf(resultSubTab) >= SUBTAB_ORDER.indexOf(prevSubRef.current) ? 1 : -1;
    prevSubRef.current = resultSubTab;
  }
  const lastSubTabRef = useRef<ResultSubTab>(resultSubTab);
  if (activeTab === 'hasil') lastSubTabRef.current = resultSubTab;

  const goToTab = useCallback(
    (tab: MobileTab, sub?: ResultSubTab) => {
      const target = tabPath(tab, tab === 'hasil' ? sub ?? lastSubTabRef.current : undefined);
      if (target !== location.pathname) navigate(target);
      window.scrollTo({ top: 0 });
    },
    [location.pathname, navigate]
  );

  const goToSubTab = useCallback(
    (sub: ResultSubTab) => {
      // Sub-tab mengganti entri riwayat agar tombol kembali tetap menuju tab sebelumnya.
      navigate(tabPath('hasil', sub), { replace: true });
    },
    [navigate]
  );

  const handleHeaderBack = useCallback(() => {
    if (canGoBackInApp) navigate(-1);
    else navigate(tabPath('beranda'), { replace: true });
  }, [canGoBackInApp, navigate]);

  // ── Sesi & dossier pasien ─────────────────────────────────────────────────
  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(PATIENT_TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [dossier, setDossier] = useState<PatientDossierPayload | null>(null);
  const [dossierStatus, setDossierStatus] = useState<DossierStatus>(() => (token ? 'loading' : 'idle'));
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingGoogleUser, setPendingGoogleUser] = useState<{ email: string; displayName: string } | null>(null);

  const [showQrModal, setShowQrModal] = useState(false);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);

  // Pencarian dokter dipertahankan saat berpindah tab.
  const [docQuery, setDocQuery] = useState('');
  const [selectedPoliId, setSelectedPoliId] = useState('ALL');
  const [visibleDoctorCount, setVisibleDoctorCount] = useState(DOCTOR_PAGE_SIZE);
  const [bookingDoc, setBookingDoc] = useState<PublicDoctor | null>(null);
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);

  useEffect(() => {
    // Bersihkan cache dossier lama; data medis tidak disimpan di perangkat.
    try {
      localStorage.removeItem('myitaru_patient_cached_dossier');
    } catch {
      // Abaikan bila penyimpanan diblokir.
    }
  }, []);

  const clearSession = useCallback(() => {
    setToken(null);
    setDossier(null);
    setDossierStatus('idle');
    setLastLoadedAt(null);
    try {
      sessionStorage.removeItem(PATIENT_TOKEN_KEY);
    } catch {
      // Abaikan bila penyimpanan diblokir.
    }
  }, []);

  const persistSession = useCallback((newToken: string, newDossier: PatientDossierPayload) => {
    setToken(newToken);
    setDossier(newDossier);
    setDossierStatus('ready');
    setLastLoadedAt(Date.now());
    setPendingGoogleUser(null);
    try {
      sessionStorage.setItem(PATIENT_TOKEN_KEY, newToken);
    } catch {
      // Abaikan kuota penyimpanan.
    }
  }, []);

  const loadDossier = useCallback(
    async (mode: 'initial' | 'silent' | 'manual') => {
      if (!token) return;
      if (mode === 'silent' && !navigator.onLine) return;
      if (mode === 'initial') setDossierStatus('loading');
      if (mode === 'manual') setIsRefreshing(true);
      try {
        const res = await fetch('/api/patient/dossier', { headers: { Authorization: `Bearer ${token}` } });
        if (res.status === 401) {
          if (mode !== 'silent') {
            toast.error('Sesi verifikasi berakhir. Silakan verifikasi ulang.');
            clearSession();
          }
          return;
        }
        const data = res.ok ? await res.json().catch(() => null) : null;
        if (data?.dossier) {
          setDossier(data.dossier);
          setDossierStatus('ready');
          setLastLoadedAt(Date.now());
          if (mode === 'manual') toast.success('Data antrean & medis diperbarui.');
        } else if (mode === 'initial') {
          setDossierStatus('error');
        } else if (mode === 'manual') {
          toast.error('Data belum dapat diperbarui. Coba beberapa saat lagi.');
        }
      } catch {
        if (mode === 'initial') setDossierStatus('error');
        if (mode === 'manual') {
          toast.error(
            navigator.onLine
              ? 'Gagal menghubungi server. Coba beberapa saat lagi.'
              : 'Anda sedang offline. Data belum dapat diperbarui.'
          );
        }
      } finally {
        if (mode === 'manual') setIsRefreshing(false);
      }
    },
    [token, clearSession]
  );

  // Muat dossier saat token sudah ada (mis. setelah memuat ulang halaman).
  useEffect(() => {
    if (token && !dossier) loadDossier('initial');
  }, [token]);

  // Saat koneksi kembali, perbarui data diam-diam.
  const wasOnlineRef = useRef(isOnline);
  useEffect(() => {
    if (isOnline && !wasOnlineRef.current && token) {
      loadDossier(dossier ? 'silent' : 'initial');
    }
    wasOnlineRef.current = isOnline;
  }, [isOnline, token, dossier, loadDossier]);

  const refreshSilently = useCallback(() => {
    loadDossier('silent');
  }, [loadDossier]);

  const notif = usePatientNotifications({
    token,
    noRm: dossier?.patient?.no_rm,
    authMethod: dossier?.authMethod,
    onRealtimeUpdate: refreshSilently
  });

  // ── Autentikasi ───────────────────────────────────────────────────────────
  const handleVerifyRmDob = async (noRm: string, dob: string) => {
    if (!noRm.trim() || !dob.trim()) {
      toast.error('No. Rekam Medis dan Tanggal Lahir wajib diisi.');
      return;
    }
    setIsVerifying(true);
    try {
      const res = await fetch('/api/patient/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ no_rm: noRm.trim(), tanggal_lahir: dob.trim() })
      });
      if (res.status === 503) {
        toast.error(PATIENT_LOGIN_UNAVAILABLE_MESSAGE);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.dossier || !data?.token) {
        toast.error(data?.message || 'Verifikasi No. RM dan Tanggal Lahir gagal.');
        return;
      }
      persistSession(data.token, data.dossier);
      toast.success(`Selamat datang, ${data.dossier.patient?.nama ?? 'Pasien'}`);
    } catch {
      toast.error('Tidak dapat menghubungi server verifikasi.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleGooglePatientLogin = async () => {
    setIsVerifying(true);
    try {
      const authRes = await signInWithGoogle();
      if (!authRes.success) {
        if (authRes.isCancelled) toast(authRes.message, { icon: 'ℹ️' });
        else toast.error(authRes.message);
        return;
      }
      const fUser = auth?.currentUser;
      const email = fUser?.email;
      if (!fUser || !email) {
        toast.error('Email akun Google tidak ditemukan.');
        return;
      }
      const res = await fetch('/api/patient/google-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName: fUser.displayName || email.split('@')[0], uid: fUser.uid })
      });
      if (res.status === 503) {
        toast.error(PATIENT_LOGIN_UNAVAILABLE_MESSAGE);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        toast.error(data?.message || 'Gagal memverifikasi akun Google pasien.');
        return;
      }
      if (data.linked && data.dossier && data.token) {
        persistSession(data.token, data.dossier);
        toast.success(`Masuk sebagai ${data.dossier.patient?.nama ?? 'Pasien'}`);
      } else {
        setPendingGoogleUser({ email, displayName: fUser.displayName || email.split('@')[0] });
        toast.success('Akun Google terverifikasi! Hubungkan No. RM Anda.');
      }
    } catch {
      toast.error('Gagal melakukan autentikasi Google.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBindGoogleToRm = async (noRm: string, dob: string) => {
    if (!pendingGoogleUser) return;
    if (!noRm.trim() || !dob.trim()) {
      toast.error('Masukkan No. RM dan Tanggal Lahir untuk menautkan akun Google.');
      return;
    }
    setIsVerifying(true);
    try {
      const res = await fetch('/api/patient/google-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: pendingGoogleUser.email,
          displayName: pendingGoogleUser.displayName,
          linkNoRm: noRm.trim(),
          linkTanggalLahir: dob.trim()
        })
      });
      if (res.status === 503) {
        toast.error(PATIENT_LOGIN_UNAVAILABLE_MESSAGE);
        return;
      }
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success || !data?.dossier || !data?.token) {
        toast.error(data?.message || 'Gagal menautkan No. RM ke akun Google.');
        return;
      }
      persistSession(data.token, data.dossier);
      toast.success('Profil rekam medis berhasil ditautkan ke Akun Google!');
    } catch {
      toast.error('Gagal menghubungi server.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handlePatientLogout = async () => {
    try {
      const response = await fetch('/api/patient/session', {
        method: 'DELETE',
        credentials: 'same-origin',
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!response.ok) throw new Error('Sesi pasien tidak dapat diakhiri di server.');
      await unregisterFcmForPatient(token, dossier?.patient?.no_rm);
      if (auth?.currentUser) await signOut(auth);
    } catch {
      toast.error('Sesi pasien tidak dapat diakhiri. Periksa koneksi dan coba kembali.');
      return;
    }
    clearSession();
    setPendingGoogleUser(null);
    notif.reset();
    setShowQrModal(false);
    setShowNotificationsModal(false);
    setBookingDoc(null);
    navigate(tabPath('beranda'), { replace: true });
    toast.success('Anda telah keluar dari sesi pasien.');
  };

  // ── Booking ───────────────────────────────────────────────────────────────
  const handleMobileBooking = async (request: BookingRequest) => {
    if (!bookingDoc) return;
    if (!token) {
      toast.error('Sesi pasien berakhir. Silakan masuk kembali.');
      return;
    }
    setIsBookingSubmitting(true);
    try {
      // Identitas pasien ditentukan server dari sesi (Authorization: Bearer), bukan dari body.
      const res = await fetch('/api/patient/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          poli_id: bookingDoc.poli_id,
          poli_nama: bookingDoc.poli,
          dokter_id: bookingDoc.id,
          dokter_nama: bookingDoc.nama,
          tanggal: request.tanggal,
          jam_praktek: bookingDoc.jam || '',
          penjamin: request.penjamin,
          keluhan: request.keluhan
        })
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        toast.error('Sesi pasien berakhir. Silakan masuk kembali untuk membuat janji temu.');
        setBookingDoc(null);
        clearSession();
        return;
      }
      if (!res.ok || !data?.success) {
        toast.error(data?.message || 'Gagal membuat janji temu.');
        return;
      }
      setBookingDoc(null);
      loadDossier('silent');
      goToTab('beranda');
      const queueNumber = data?.booking?.nomor_antrian;
      toast.success(queueNumber ? `Antrean baru ${queueNumber} diterbitkan!` : 'Janji temu berhasil dibuat.');
    } catch {
      toast.error('Koneksi bermasalah saat membuat janji temu.');
    } finally {
      setIsBookingSubmitting(false);
    }
  };

  const openNotification = (item: PatientNotificationItem) => {
    notif.markRead(item);
    setShowNotificationsModal(false);
    if (item.type === 'lab_ready') goToTab('hasil', 'lab');
    else if (item.type === 'queue_call') goToTab('beranda');
  };

  // ── Render ────────────────────────────────────────────────────────────────
  if (needsRedirect) {
    return <Navigate to={routeTab === undefined ? legacyTabRedirect(location.search) : tabPath(activeTab, resultSubTab)} replace />;
  }

  if (!token) {
    return (
      <LoginScreen
        pendingGoogleUser={pendingGoogleUser}
        isVerifying={isVerifying}
        authLoading={authLoading}
        onBack={() => navigate('/')}
        onVerifyRmDob={handleVerifyRmDob}
        onGoogleLogin={handleGooglePatientLogin}
        onBindGoogle={handleBindGoogleToRm}
      />
    );
  }

  const loading = dossierStatus === 'loading';
  const primaryQueue = dossier?.activeQueues?.[0];

  let screen: React.ReactNode;
  if (!dossier && dossierStatus === 'error') {
    screen = (
      <EmptyState
        tone="error"
        icon={isOnline ? CloudOff : WifiOff}
        title="Data pasien belum dapat dimuat"
        description={
          isOnline
            ? 'Server tidak dapat dihubungi. Coba lagi beberapa saat lagi.'
            : 'Anda sedang offline. Sambungkan perangkat ke internet, lalu coba lagi.'
        }
        action={
          <button
            type="button"
            onClick={() => loadDossier('initial')}
            className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#0B3D91] text-white text-sm font-bold cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Coba Lagi
          </button>
        }
      />
    );
  } else if (activeTab === 'beranda') {
    screen = (
      <BerandaScreen
        dossier={dossier}
        loading={loading}
        notif={notif}
        onOpenQr={() => setShowQrModal(true)}
        onGoJadwal={() => goToTab('jadwal')}
        onGoLab={() => goToTab('hasil', 'lab')}
        onGoTagihan={() => goToTab('tagihan')}
        onOpenNotifications={() => setShowNotificationsModal(true)}
      />
    );
  } else if (activeTab === 'jadwal') {
    screen = (
      <JadwalScreen
        doctors={catalog.doctors}
        poliklinik={catalog.poliklinik}
        status={catalog.status}
        onReload={catalog.reload}
        query={docQuery}
        onQueryChange={(value) => {
          setDocQuery(value);
          setVisibleDoctorCount(DOCTOR_PAGE_SIZE);
        }}
        poliId={selectedPoliId}
        onPoliChange={(value) => {
          setSelectedPoliId(value);
          setVisibleDoctorCount(DOCTOR_PAGE_SIZE);
        }}
        visibleCount={visibleDoctorCount}
        onShowMore={() => setVisibleDoctorCount((n) => n + DOCTOR_PAGE_SIZE)}
        onSelectDoctor={(doc) => {
          if (!dossier) {
            toast.error('Data pasien belum dimuat. Coba perbarui data terlebih dahulu.');
            return;
          }
          setBookingDoc(doc);
        }}
      />
    );
  } else if (activeTab === 'hasil') {
    screen = (
      <HasilScreen
        dossier={dossier}
        loading={loading}
        subTab={resultSubTab}
        direction={subDirectionRef.current}
        onSelectSubTab={goToSubTab}
      />
    );
  } else {
    screen = (
      <TagihanScreen
        dossier={dossier}
        loading={loading}
        onLogout={handlePatientLogout}
        onOpenPortal={() => navigate('/')}
      />
    );
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-slate-50 text-slate-900 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-10 overflow-x-hidden">
        <AppHeader
          patient={dossier?.patient ?? null}
          activeTab={activeTab}
          showBack={canGoBackInApp || activeTab !== 'beranda'}
          onBack={handleHeaderBack}
          onSelectTab={(tab) => goToTab(tab)}
          unreadCount={notif.unreadCount}
          sseConnected={notif.sseConnected}
          isRefreshing={isRefreshing}
          onOpenNotifications={() => setShowNotificationsModal(true)}
          onRefresh={() => loadDossier(dossier ? 'manual' : 'initial')}
          onOpenQr={() => setShowQrModal(true)}
        />

        <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
          {!isOnline && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-amber-300 bg-amber-50 text-amber-950 p-3.5 flex items-start gap-2.5 text-sm"
            >
              <WifiOff className="w-5 h-5 shrink-0 mt-0.5" aria-hidden="true" />
              <p>
                <strong>Anda sedang offline.</strong>{' '}
                {dossier && lastLoadedAt
                  ? `Data di layar dimuat pukul ${formatClock(lastLoadedAt)} dan mungkin belum terbaru.`
                  : 'Sambungkan internet untuk memuat data terbaru.'}
              </p>
            </div>
          )}

          {notif.liveBannerAlert && (
            <LiveAlertBanner alert={notif.liveBannerAlert} onOpen={openNotification} onDismiss={notif.dismissLiveBanner} />
          )}

          <AnimatePresence mode="wait" custom={tabDirectionRef.current} initial={false}>
            <motion.section
              key={activeTab}
              custom={tabDirectionRef.current}
              variants={fadeSlideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={fadeSlideTransition}
              aria-label={
                activeTab === 'beranda'
                  ? 'Beranda'
                  : activeTab === 'jadwal'
                  ? 'Jadwal dan pendaftaran'
                  : activeTab === 'hasil'
                  ? 'Hasil medis'
                  : 'Tagihan dan akun'
              }
            >
              {screen}
            </motion.section>
          </AnimatePresence>
        </main>

        <BottomNav activeTab={activeTab} onSelectTab={(tab) => goToTab(tab)} />

        <QrCardModal
          open={showQrModal}
          onClose={() => setShowQrModal(false)}
          token={token}
          patientName={dossier?.patient?.nama}
          noRm={dossier?.patient?.no_rm}
          queueNumber={primaryQueue?.nomor_antrian}
        />

        <BookingModal
          doctor={bookingDoc}
          patientPenjamin={dossier?.patient?.penjamin}
          isSubmitting={isBookingSubmitting}
          onSubmit={handleMobileBooking}
          onClose={() => setBookingDoc(null)}
        />

        <NotificationsModal
          open={showNotificationsModal}
          onClose={() => setShowNotificationsModal(false)}
          notif={notif}
          onOpenItem={openNotification}
        />
      </div>
    </MotionConfig>
  );
};
