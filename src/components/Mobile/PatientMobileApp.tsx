import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  Home,
  CalendarPlus,
  FileHeart,
  Receipt,
  RefreshCw,
  ArrowLeft,
  ShieldCheck,
  AlertTriangle,
  HeartPulse,
  FlaskConical,
  Pill,
  Stethoscope,
  Search,
  CheckCircle2,
  LogOut,
  PhoneCall,
  QrCode,
  UserCheck,
  Clock,
  Bell,
  BellRing,
  BellOff,
  CheckCheck,
  Volume2,
  X,
  Sparkles
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../contexts/AuthContext';
import { auth } from '../../lib/firebase';
import {
  checkFcmCapability,
  getCachedFcmPrefs,
  getCachedFcmToken,
  markFirestoreNotificationRead,
  playClinicalNotificationChime,
  registerFcmForPatient,
  showNativeBrowserNotification,
  subscribeFirestorePatientNotifications,
  subscribeForegroundFcm,
  syncNotificationToFirestoreIfSignedIn,
  unregisterFcmForPatient,
  type FcmCapabilityStatus,
  type PatientNotificationItem
} from '../../lib/fcm';
import { type PatientDossierPayload } from '../../server/patientPortalService';
import { getPublicPoliklinik, getPublicDoctors } from '../../data/hospitalPublicCatalog';
import { PWAInstallButton } from '../PWA/PWAInstallButton';
import { BrandLogo } from '../Common/BrandLogo';

type MobileTab = 'beranda' | 'jadwal' | 'hasil' | 'tagihan';
type ResultSubTab = 'resume' | 'lab' | 'obat';

const TAB_ORDER: MobileTab[] = ['beranda', 'jadwal', 'hasil', 'tagihan'];
const SUBTAB_ORDER: ResultSubTab[] = ['resume', 'lab', 'obat'];

const fadeSlideVariants = {
  enter: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? 22 : -22,
    y: 6
  }),
  center: {
    opacity: 1,
    x: 0,
    y: 0
  },
  exit: (direction: number) => ({
    opacity: 0,
    x: direction >= 0 ? -22 : 22,
    y: -4
  })
};

const fadeSlideTransition = {
  duration: 0.22,
  ease: [0.22, 1, 0.36, 1] as const
};

interface DemoSample {
  label: string;
  no_rm: string;
  tanggal_lahir: string;
}

const DEFAULT_DEMO_SAMPLES: DemoSample[] = [
  { label: 'Ny. Siti Rahmawati (Poli Dalam)', no_rm: 'RM-260101-0001', tanggal_lahir: '1985-04-23' },
  { label: 'Tn. Budi Santoso (Kardiologi)', no_rm: 'RM-260102-0002', tanggal_lahir: '1978-08-15' }
];

const PATIENT_TOKEN_KEY = 'myitaru_patient_token';
const PATIENT_CACHE_KEY = 'myitaru_patient_cached_dossier';

export const PatientMobileApp: React.FC = () => {
  const navigate = useNavigate();
  const { signInWithGoogle, logout: authLogout, loading: authLoading } = useAuth();

  const poliklinikList = useMemo(() => getPublicPoliklinik(), []);
  const fallbackDoctors = useMemo(() => getPublicDoctors(), []);

  const [token, setToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem(PATIENT_TOKEN_KEY);
    } catch {
      return null;
    }
  });

  const [dossier, setDossier] = useState<PatientDossierPayload | null>(() => {
    try {
      const cached = localStorage.getItem(PATIENT_CACHE_KEY);
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const [authMode, setAuthMode] = useState<'rm_dob' | 'google'>('rm_dob');
  const [noRmInput, setNoRmInput] = useState('');
  const [dobInput, setDobInput] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Google account authenticated but not yet linked to a No. RM
  const [pendingGoogleUser, setPendingGoogleUser] = useState<{
    email: string;
    displayName: string;
  } | null>(null);

  const [demoSamples, setDemoSamples] = useState<DemoSample[]>(DEFAULT_DEMO_SAMPLES);
  const [doctors, setDoctors] = useState(fallbackDoctors);

  const [activeTab, setActiveTab] = useState<MobileTab>(() => {
    try {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam === 'jadwal' || tabParam === 'hasil' || tabParam === 'tagihan') {
        return tabParam;
      }
    } catch {}
    return 'beranda';
  });
  const [tabDirection, setTabDirection] = useState<number>(1);
  const [resultSubTab, setResultSubTab] = useState<ResultSubTab>(() => {
    try {
      const tabParam = new URLSearchParams(window.location.search).get('tab');
      if (tabParam === 'hasil') return 'lab';
    } catch {}
    return 'resume';
  });
  const [subTabDirection, setSubTabDirection] = useState<number>(1);
  const [showQrModal, setShowQrModal] = useState(false);

  const switchTab = useCallback(
    (nextTab: MobileTab) => {
      setActiveTab((prev) => {
        if (prev === nextTab) return prev;
        const prevIdx = TAB_ORDER.indexOf(prev);
        const nextIdx = TAB_ORDER.indexOf(nextTab);
        setTabDirection(nextIdx >= prevIdx ? 1 : -1);
        return nextTab;
      });
    },
    []
  );

  const switchResultSubTab = useCallback(
    (nextSubTab: ResultSubTab) => {
      setResultSubTab((prev) => {
        if (prev === nextSubTab) return prev;
        const prevIdx = SUBTAB_ORDER.indexOf(prev);
        const nextIdx = SUBTAB_ORDER.indexOf(nextSubTab);
        setSubTabDirection(nextIdx >= prevIdx ? 1 : -1);
        return nextSubTab;
      });
    },
    []
  );

  // Real-Time FCM & Patient Notification State
  const initialPrefs = useMemo(() => getCachedFcmPrefs(), []);
  const [notifications, setNotifications] = useState<PatientNotificationItem[]>([]);
  const [liveBannerAlert, setLiveBannerAlert] = useState<PatientNotificationItem | null>(null);
  const [showNotificationsModal, setShowNotificationsModal] = useState(false);
  const [fcmCapability, setFcmCapability] = useState<FcmCapabilityStatus | null>(null);
  const [fcmMode, setFcmMode] = useState<'fcm_web_push' | 'realtime_sse_fallback' | 'inactive'>('inactive');
  const [fcmTokenPreview, setFcmTokenPreview] = useState<string | null>(() => getCachedFcmToken());
  const [fcmSyncing, setFcmSyncing] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [simulatingType, setSimulatingType] = useState<'queue_call' | 'lab_ready' | null>(null);
  const [queueAlertsEnabled, setQueueAlertsEnabled] = useState<boolean>(initialPrefs.queueAlertsEnabled);
  const [labAlertsEnabled, setLabAlertsEnabled] = useState<boolean>(initialPrefs.labAlertsEnabled);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const firestoreInitializedRef = useRef<boolean>(false);

  // Doctor search & booking state inside mobile app
  const [docQuery, setDocQuery] = useState('');
  const [selectedPoliId, setSelectedPoliId] = useState('ALL');
  const [bookingDoc, setBookingDoc] = useState<(typeof fallbackDoctors)[number] | null>(null);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().split('T')[0]);
  const [bookingPenjamin, setBookingPenjamin] = useState('Umum / Mandiri');
  const [bookingKeluhan, setBookingKeluhan] = useState('');
  const [isBookingSubmitting, setIsBookingSubmitting] = useState(false);

  const unreadCount = useMemo(
    () => notifications.filter((item) => !item.read).length,
    [notifications]
  );

  // Fetch public catalog (doctors + quick demo patients)
  useEffect(() => {
    fetch('/api/public/hospital-catalog')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.doctors && Array.isArray(data.doctors)) setDoctors(data.doctors);
        if (data?.demoPatients && Array.isArray(data.demoPatients)) setDemoSamples(data.demoPatients);
      })
      .catch(() => {});
  }, []);

  const persistSession = useCallback((newToken: string, newDossier: PatientDossierPayload) => {
    setToken(newToken);
    setDossier(newDossier);
    setPendingGoogleUser(null);
    try {
      sessionStorage.setItem(PATIENT_TOKEN_KEY, newToken);
      localStorage.setItem(PATIENT_CACHE_KEY, JSON.stringify(newDossier));
    } catch {
      // Ignore storage quota exceptions
    }
  }, []);

  const fetchDossierSilent = useCallback(async () => {
    if (!token || !navigator.onLine) return;
    try {
      const res = await fetch('/api/patient/dossier', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.dossier) {
          setDossier(data.dossier);
          try {
            localStorage.setItem(PATIENT_CACHE_KEY, JSON.stringify(data.dossier));
          } catch {}
        }
      }
    } catch {
      // Ignore silent background refresh failures
    }
  }, [token]);

  const refreshDossier = useCallback(async () => {
    if (!token) return;
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/patient/dossier', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.dossier) {
          setDossier(data.dossier);
          localStorage.setItem(PATIENT_CACHE_KEY, JSON.stringify(data.dossier));
          toast.success('Data antrean & medis diperbarui.');
        }
      } else if (res.status === 401 && navigator.onLine) {
        // Server restarted in memory — clear stale token if online and cannot refresh
        toast.error('Sesi verifikasi berakhir. Silakan verifikasi ulang.');
        setToken(null);
        setDossier(null);
        sessionStorage.removeItem(PATIENT_TOKEN_KEY);
      }
    } catch {
      toast('Menampilkan data tersimpan terakhir (offline).', { icon: 'ℹ️' });
    } finally {
      setIsRefreshing(false);
    }
  }, [token]);

  // Refresh silently on mount when token exists & online
  useEffect(() => {
    if (token && navigator.onLine) {
      fetchDossierSilent();
    }
  }, [token, fetchDossierSilent]);

  const handleIncomingRealtimeAlert = useCallback(
    (incoming: PatientNotificationItem, announce = true) => {
      if (!incoming || !incoming.id) return;
      if (seenNotifIdsRef.current.has(incoming.id)) return;
      seenNotifIdsRef.current.add(incoming.id);

      setNotifications((prev) => {
        const filtered = prev.filter((item) => item.id !== incoming.id);
        return [incoming, ...filtered].slice(0, 40);
      });

      if (announce) {
        setLiveBannerAlert(incoming);
        playClinicalNotificationChime(incoming.type);
        toast(incoming.title, {
          icon: incoming.type === 'queue_call' ? '🔊' : '🧪',
          duration: 6000
        });
        showNativeBrowserNotification({
          id: incoming.id,
          title: incoming.title,
          body: incoming.body,
          type: incoming.type
        });
        syncNotificationToFirestoreIfSignedIn(incoming);
        fetchDossierSilent();
      }
    },
    [fetchDossierSilent]
  );

  // Initialize FCM capability check, notification inbox, foreground FCM, SSE stream & Firestore sync
  useEffect(() => {
    if (!token || !dossier?.patient?.no_rm) {
      setSseConnected(false);
      return;
    }

    const noRm = dossier.patient.no_rm;
    let cancelled = false;
    let unsubscribeForeground: (() => void) | null = null;
    let unsubscribeFirestore: (() => void) | null = null;
    let eventSource: EventSource | null = null;

    (async () => {
      const cap = await checkFcmCapability();
      if (cancelled) return;
      setFcmCapability(cap);

      // Hydrate notification inbox
      try {
        const notifRes = await fetch('/api/patient/notifications', {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (notifRes.ok) {
          const notifData = await notifRes.json();
          if (!cancelled && Array.isArray(notifData?.notifications)) {
            notifData.notifications.forEach((n: PatientNotificationItem) => {
              seenNotifIdsRef.current.add(n.id);
            });
            setNotifications(notifData.notifications);
          }
        }
      } catch {}

      // Auto-sync FCM channel silently if browser permission is already granted or cached token exists
      if (cap.permission === 'granted' || getCachedFcmToken()) {
        const reg = await registerFcmForPatient({
          no_rm: noRm,
          patientToken: token,
          queueAlertsEnabled,
          labAlertsEnabled,
          promptPermission: false
        });
        if (!cancelled) {
          setFcmMode(reg.mode);
          setFcmTokenPreview(reg.fcmToken);
        }
      }

      // Subscribe foreground FCM Web Push listener
      unsubscribeForeground = await subscribeForegroundFcm((payload) => {
        const data = (payload.data || {}) as Record<string, string>;
        const title =
          payload.notification?.title || data.title || 'Notifikasi MYITARU';
        const body =
          payload.notification?.body || data.body || 'Pembaruan antrean atau hasil lab tersedia.';
        const notifType =
          data.type === 'queue_call' || data.type === 'lab_ready' ? data.type : 'system';

        handleIncomingRealtimeAlert({
          id: data.id || `fcm_${Date.now()}`,
          no_rm: data.no_rm || noRm,
          type: notifType,
          title,
          body,
          poli: data.poli || undefined,
          nomor_antrian: data.nomor_antrian || undefined,
          lab_order_id: data.lab_order_id || undefined,
          channel: 'fcm_foreground',
          read: false,
          createdAt: new Date().toISOString()
        });
      });

      // Subscribe Firestore patient_notifications when signed in with Google
      if (dossier.authMethod === 'google' && auth?.currentUser?.emailVerified && auth?.currentUser?.uid) {
        firestoreInitializedRef.current = false;
        unsubscribeFirestore = subscribeFirestorePatientNotifications(auth.currentUser.uid, (fsItems) => {
          if (!firestoreInitializedRef.current) {
            firestoreInitializedRef.current = true;
            fsItems.forEach((item) => {
              if (!seenNotifIdsRef.current.has(item.id)) {
                seenNotifIdsRef.current.add(item.id);
                setNotifications((prev) => [item, ...prev].slice(0, 40));
              }
            });
            return;
          }
          fsItems.forEach((item) => {
            if (!seenNotifIdsRef.current.has(item.id)) {
              handleIncomingRealtimeAlert(item, true);
            }
          });
        });
      }
    })();

    // Open live SSE push stream
    if (typeof EventSource !== 'undefined') {
      eventSource = new EventSource(`/api/patient/notifications/stream?token=${encodeURIComponent(token)}`);
      eventSource.onopen = () => {
        if (!cancelled) setSseConnected(true);
      };
      eventSource.addEventListener('patient_notification', (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data) as PatientNotificationItem;
          handleIncomingRealtimeAlert(parsed, true);
        } catch {}
      });
      eventSource.onerror = () => {
        if (!cancelled) setSseConnected(false);
      };
    }

    return () => {
      cancelled = true;
      setSseConnected(false);
      eventSource?.close();
      unsubscribeForeground?.();
      unsubscribeFirestore?.();
    };
  }, [token, dossier?.patient?.no_rm, dossier?.authMethod, queueAlertsEnabled, labAlertsEnabled, handleIncomingRealtimeAlert]);

  const handleEnableFcmNotifications = async () => {
    if (!token || !dossier?.patient?.no_rm) return;
    setFcmSyncing(true);
    try {
      const result = await registerFcmForPatient({
        no_rm: dossier.patient.no_rm,
        patientToken: token,
        queueAlertsEnabled,
        labAlertsEnabled,
        promptPermission: true
      });
      const updatedCap = await checkFcmCapability();
      setFcmCapability(updatedCap);
      setFcmMode(result.mode);
      setFcmTokenPreview(result.fcmToken);
      toast.success(result.message);
    } catch {
      toast.error('Gagal mengaktifkan notifikasi push FCM.');
    } finally {
      setFcmSyncing(false);
    }
  };

  const handleToggleAlertPreference = async (target: 'queue' | 'lab') => {
    const nextQueue = target === 'queue' ? !queueAlertsEnabled : queueAlertsEnabled;
    const nextLab = target === 'lab' ? !labAlertsEnabled : labAlertsEnabled;
    setQueueAlertsEnabled(nextQueue);
    setLabAlertsEnabled(nextLab);

    if (token && dossier?.patient?.no_rm) {
      const reg = await registerFcmForPatient({
        no_rm: dossier.patient.no_rm,
        patientToken: token,
        queueAlertsEnabled: nextQueue,
        labAlertsEnabled: nextLab,
        promptPermission: false
      });
      setFcmMode(reg.mode);
      setFcmTokenPreview(reg.fcmToken);
      toast.success('Preferensi notifikasi real-time disimpan.');
    }
  };

  const handleMarkNotificationRead = async (item: PatientNotificationItem) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === item.id ? { ...n, read: true } : n))
    );
    if (liveBannerAlert?.id === item.id) {
      setLiveBannerAlert(null);
    }
    if (token) {
      fetch('/api/patient/notifications/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ id: item.id })
      }).catch(() => {});
    }
    if (dossier?.authMethod === 'google' && auth?.currentUser?.emailVerified) {
      markFirestoreNotificationRead(item.id).catch(() => {});
    }
    setShowNotificationsModal(false);
    if (item.type === 'lab_ready') {
      switchTab('hasil');
      switchResultSubTab('lab');
    } else if (item.type === 'queue_call') {
      switchTab('beranda');
    }
  };

  const handleMarkAllRead = async () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setLiveBannerAlert(null);
    if (token) {
      fetch('/api/patient/notifications/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ markAll: true })
      }).catch(() => {});
    }
    if (dossier?.authMethod === 'google' && auth?.currentUser?.emailVerified) {
      unreadIds.forEach((id) => {
        markFirestoreNotificationRead(id).catch(() => {});
      });
    }
    toast.success('Semua notifikasi ditandai sudah dibaca.');
  };

  const handleSimulatePush = async (type: 'queue_call' | 'lab_ready') => {
    if (!token) return;
    setSimulatingType(type);
    try {
      const res = await fetch('/api/patient/notifications/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ type })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.message || 'Gagal menjalankan simulasi notifikasi.');
        return;
      }
      if (data.notification) {
        handleIncomingRealtimeAlert(data.notification, true);
      }
    } catch {
      toast.error('Koneksi bermasalah saat mengirim uji notifikasi.');
    } finally {
      setSimulatingType(null);
    }
  };

  const handleVerifyRmDob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noRmInput.trim() || !dobInput.trim()) {
      toast.error('No. Rekam Medis dan Tanggal Lahir wajib diisi.');
      return;
    }

    setIsVerifying(true);
    try {
      const res = await fetch('/api/patient/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          no_rm: noRmInput.trim(),
          tanggal_lahir: dobInput.trim()
        })
      });

      const data = await res.json();
      if (!res.ok || !data?.success || !data?.dossier) {
        toast.error(data?.message || 'Verifikasi No. RM dan Tanggal Lahir gagal.');
        return;
      }

      persistSession(data.token, data.dossier);
      toast.success(`Selamat datang, ${data.dossier.patient.nama}`);
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
        if (authRes.isCancelled) {
          toast(authRes.message, { icon: 'ℹ️' });
        } else {
          toast.error(authRes.message);
        }
        return;
      }

      const fUser = auth?.currentUser;
      const email = fUser?.email;
      if (!email) {
        toast.error('Email akun Google tidak ditemukan.');
        return;
      }

      const res = await fetch('/api/patient/google-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          displayName: fUser.displayName || email.split('@')[0],
          uid: fUser.uid
        })
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.message || 'Gagal memverifikasi akun Google pasien.');
        return;
      }

      if (data.linked && data.dossier && data.token) {
        persistSession(data.token, data.dossier);
        toast.success(`Masuk sebagai ${data.dossier.patient.nama}`);
      } else {
        setPendingGoogleUser({
          email,
          displayName: fUser.displayName || email.split('@')[0]
        });
        toast.success('Akun Google terverifikasi! Hubungkan No. RM Anda.');
      }
    } catch {
      toast.error('Gagal melakukan autentikasi Google.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleBindGoogleToRm = async (useDemo = false) => {
    if (!pendingGoogleUser) return;
    if (!useDemo && (!noRmInput.trim() || !dobInput.trim())) {
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
          useDemoSample: useDemo,
          linkNoRm: useDemo ? undefined : noRmInput.trim(),
          linkTanggalLahir: useDemo ? undefined : dobInput.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.success || !data?.dossier) {
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
    await unregisterFcmForPatient(token, dossier?.patient?.no_rm);
    setToken(null);
    setDossier(null);
    setPendingGoogleUser(null);
    setNotifications([]);
    setLiveBannerAlert(null);
    setFcmMode('inactive');
    seenNotifIdsRef.current.clear();
    try {
      sessionStorage.removeItem(PATIENT_TOKEN_KEY);
      localStorage.removeItem(PATIENT_CACHE_KEY);
      await authLogout();
    } catch {}
    toast.success('Anda telah keluar dari sesi pasien.');
  };

  const handleMobileBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bookingDoc || !dossier) return;
    setIsBookingSubmitting(true);
    try {
      const res = await fetch('/api/patient/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          no_rm: dossier.patient.no_rm,
          nama: dossier.patient.nama,
          tanggal_lahir: dossier.patient.tanggal_lahir,
          no_hp: dossier.patient.no_hp,
          poli_id: bookingDoc.poli_id,
          poli_nama: bookingDoc.poli,
          dokter_id: bookingDoc.id,
          dokter_nama: bookingDoc.nama,
          tanggal: bookingDate,
          jam_praktek: bookingDoc.jam || '08:00 - 13:00 WIB',
          penjamin: bookingPenjamin,
          keluhan: bookingKeluhan,
          google_email: dossier.linkedEmail
        })
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.message || 'Gagal membuat janji temu.');
        return;
      }

      if (data.token && data.dossier) {
        persistSession(data.token, data.dossier);
      }
      setBookingDoc(null);
      setBookingKeluhan('');
      switchTab('beranda');
      toast.success(`Antrean baru ${data.booking.nomor_antrian} diterbitkan!`);
    } catch {
      toast.error('Koneksi bermasalah saat membuat janji temu.');
    } finally {
      setIsBookingSubmitting(false);
    }
  };

  const filteredDoctors = useMemo(() => {
    return doctors.filter((doc) => {
      const q = docQuery.trim().toLowerCase();
      const matchesQ =
        !q ||
        doc.nama.toLowerCase().includes(q) ||
        doc.spesialis.toLowerCase().includes(q) ||
        doc.poli.toLowerCase().includes(q);
      const matchesPoli = selectedPoliId === 'ALL' || doc.poli_id === selectedPoliId;
      return matchesQ && matchesPoli;
    });
  }, [doctors, docQuery, selectedPoliId]);

  const formatRupiah = (amount: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(amount);

  // ════════════════════════════════════════════════════════════════════════
  // UNVERIFIED GATE: GOOGLE LOGIN OR NO. RM + TANGGAL LAHIR VERIFICATION
  // ════════════════════════════════════════════════════════════════════════
  if (!dossier) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        {/* Compact Mobile Top Bar */}
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center justify-between gap-3 sticky top-0 z-30">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-[#0B3D91] cursor-pointer min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Portal RS</span>
          </button>

          <div className="flex items-center gap-2">
            <BrandLogo alt="MYITARU" className="w-7 h-7 rounded-lg object-cover" />
            <span className="font-extrabold text-[#0B3D91] text-sm">MYITARU Mobile</span>
          </div>

          <PWAInstallButton variant="subtle" label="Pasang App" showAlwaysGuide />
        </header>

        <main className="flex-1 flex items-center justify-center p-4 sm:p-6">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="text-center space-y-2">
              <BrandLogo alt="MYITARU" className="w-14 h-14 rounded-2xl mx-auto shadow-md object-cover" />
              <h1 className="text-2xl font-extrabold text-slate-900">
                Aplikasi Pasien MYITARU
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                Cek nomor antrean poli, jadwal dokter, hasil laboratorium &amp; radiologi, serta tagihan langsung dari ponsel.
              </p>
            </div>

            {pendingGoogleUser ? (
              <div className="space-y-4">
                <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 text-xs space-y-1">
                  <p className="font-bold text-[#0B3D91] flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4" />
                    Google Terverifikasi: {pendingGoogleUser.displayName}
                  </p>
                  <p className="text-slate-600 font-mono">{pendingGoogleUser.email}</p>
                  <p className="text-slate-600 pt-1">
                    Email ini belum terhubung dengan No. Rekam Medis. Masukkan No. RM + Tanggal Lahir Anda sekali saja untuk sinkronisasi otomatis.
                  </p>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Nomor Rekam Medis (No. RM)
                    </label>
                    <input
                      type="text"
                      value={noRmInput}
                      onChange={(e) => setNoRmInput(e.target.value)}
                      placeholder="RM-260101-0001"
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:border-[#0B3D91] outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      Tanggal Lahir
                    </label>
                    <input
                      type="date"
                      value={dobInput}
                      onChange={(e) => setDobInput(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:border-[#0B3D91] outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    disabled={isVerifying}
                    onClick={() => handleBindGoogleToRm(false)}
                    className="w-full py-3.5 rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white font-bold text-sm cursor-pointer min-h-[48px]"
                  >
                    {isVerifying ? 'Menghubungkan...' : 'Hubungkan No. RM Saya'}
                  </button>
                  <button
                    type="button"
                    disabled={isVerifying}
                    onClick={() => handleBindGoogleToRm(true)}
                    className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
                  >
                    Atau Tautkan ke Profil Sampel Uji Coba (RM-260101-0001)
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Method Tabs */}
                <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100">
                  <button
                    type="button"
                    onClick={() => setAuthMode('rm_dob')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer min-h-[44px] ${
                      authMode === 'rm_dob'
                        ? 'bg-white text-[#0B3D91] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    No. RM &amp; Tgl Lahir
                  </button>
                  <button
                    type="button"
                    onClick={() => setAuthMode('google')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-bold transition cursor-pointer min-h-[44px] ${
                      authMode === 'google'
                        ? 'bg-white text-[#0B3D91] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Akun Google
                  </button>
                </div>

                {authMode === 'rm_dob' ? (
                  <form onSubmit={handleVerifyRmDob} className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">
                        Nomor Rekam Medis (No. RM)
                      </label>
                      <input
                        type="text"
                        required
                        value={noRmInput}
                        onChange={(e) => setNoRmInput(e.target.value)}
                        placeholder="Contoh: RM-260101-0001 atau RM-0001"
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:border-[#0B3D91] focus:ring-2 focus:ring-[#0B3D91]/15 outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 mb-1.5">
                        Tanggal Lahir Pasien
                      </label>
                      <input
                        type="date"
                        required
                        value={dobInput}
                        onChange={(e) => setDobInput(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:border-[#0B3D91] focus:ring-2 focus:ring-[#0B3D91]/15 outline-none"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={isVerifying}
                      className="w-full py-3.5 rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white font-bold text-sm transition disabled:opacity-60 cursor-pointer min-h-[48px]"
                    >
                      {isVerifying ? 'Memverifikasi Identitas...' : 'Verifikasi & Masuk'}
                    </button>

                    {/* Quick Demo Fill */}
                    <div className="pt-4 border-t border-slate-200 space-y-2">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Isi Cepat Pasien Uji Coba:
                      </p>
                      <div className="space-y-1.5">
                        {demoSamples.map((sample) => (
                          <button
                            key={sample.no_rm}
                            type="button"
                            onClick={() => {
                              setNoRmInput(sample.no_rm);
                              setDobInput(sample.tanggal_lahir);
                            }}
                            className="w-full text-left px-3.5 py-2.5 rounded-xl border border-slate-200 hover:border-[#0B3D91] hover:bg-blue-50/60 transition flex items-center justify-between gap-2 cursor-pointer"
                          >
                            <div>
                              <p className="text-xs font-bold text-slate-800">{sample.label}</p>
                              <p className="text-[11px] font-mono text-slate-500">
                                {sample.no_rm} · {sample.tanggal_lahir}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-[#0B3D91]">Pilih</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4 py-2">
                    <p className="text-xs text-slate-600 text-center leading-relaxed">
                      Masuk sekali ketuk dengan Akun Google Anda yang terhubung dengan rekam medis MYITARU SIMK.
                    </p>
                    <button
                      type="button"
                      disabled={isVerifying || authLoading}
                      onClick={handleGooglePatientLogin}
                      className="w-full py-3.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm shadow-xs flex items-center justify-center gap-3 cursor-pointer min-h-[48px]"
                    >
                      <svg className="w-5 h-5" viewBox="0 0 24 24">
                        <path
                          fill="#4285F4"
                          d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                        />
                      </svg>
                      <span>{isVerifying ? 'Menghubungkan Google...' : 'Masuk dengan Akun Google'}</span>
                    </button>
                  </div>
                )}
              </>
            )}

            <div className="pt-2 text-center border-t border-slate-100">
              <a
                href="tel:1500911"
                className="inline-flex items-center gap-1.5 text-xs font-bold text-[#DC2626]"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>Darurat IGD 24 Jam: 1-500-911</span>
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // ════════════════════════════════════════════════════════════════════════
  // VERIFIED MOBILE PATIENT WORKSPACE
  // ════════════════════════════════════════════════════════════════════════
  const primaryQueue = dossier.activeQueues[0];

  return (
    <MotionConfig reducedMotion="user">
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 md:pb-10 overflow-x-hidden">
      {/* Compact Sticky Mobile App Bar */}
      <header className="sticky top-0 z-40 bg-[#0B3D91] text-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => navigate('/')}
              aria-label="Kembali ke Portal RS"
              className="p-2 rounded-xl hover:bg-white/10 transition cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <BrandLogo alt="MYITARU" className="w-8 h-8 rounded-lg object-cover border border-white/20 shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-extrabold truncate">{dossier.patient.nama}</p>
              <p className="text-[11px] text-blue-200 font-mono tabular-nums truncate">
                {dossier.patient.no_rm} · {dossier.patient.penjamin}
              </p>
            </div>
          </div>

          {/* Desktop Top Tab Navigation */}
          <nav className="hidden md:flex items-center gap-1.5">
            {[
              { id: 'beranda', label: 'Beranda' },
              { id: 'jadwal', label: 'Jadwal & Daftar' },
              { id: 'hasil', label: 'Hasil Medis' },
              { id: 'tagihan', label: 'Tagihan & Akun' }
            ].map((t) => {
              const isSelected = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => switchTab(t.id as MobileTab)}
                  className={`relative px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'text-[#0B3D91]'
                      : 'text-blue-100 hover:bg-white/10'
                  }`}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="desktopActiveTabPill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-xl bg-white shadow-xs"
                    />
                  )}
                  <span className="relative z-10">{t.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowNotificationsModal(true)}
              aria-label="Notifikasi Real-Time FCM"
              className="relative p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition cursor-pointer min-h-[42px] min-w-[42px] flex items-center justify-center"
            >
              {unreadCount > 0 ? (
                <BellRing className="w-4 h-4 text-amber-300 animate-pulse" />
              ) : (
                <Bell className="w-4 h-4" />
              )}
              {unreadCount > 0 ? (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-extrabold flex items-center justify-center shadow-xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              ) : sseConnected ? (
                <span
                  title="Saluran Real-Time Aktif"
                  className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-[#0B3D91]"
                />
              ) : null}
            </button>
            <button
              type="button"
              onClick={refreshDossier}
              disabled={isRefreshing}
              aria-label="Perbarui Data Antrean"
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition cursor-pointer min-h-[42px] min-w-[42px] flex items-center justify-center"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => setShowQrModal(true)}
              aria-label="Kartu Berobat QR"
              className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 transition cursor-pointer min-h-[42px] min-w-[42px] flex items-center justify-center"
            >
              <QrCode className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-5 space-y-5">
        {/* LIVE FCM / REAL-TIME PRIORITY NOTIFICATION BANNER */}
        {liveBannerAlert && (
          <div
            role="alert"
            className={`rounded-2xl border p-4 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
              liveBannerAlert.type === 'queue_call'
                ? 'bg-amber-50 border-amber-300 text-amber-950'
                : 'bg-emerald-50 border-emerald-300 text-emerald-950'
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`p-2.5 rounded-xl shrink-0 ${
                  liveBannerAlert.type === 'queue_call'
                    ? 'bg-amber-500 text-white'
                    : 'bg-emerald-600 text-white'
                }`}
              >
                {liveBannerAlert.type === 'queue_call' ? (
                  <Volume2 className="w-5 h-5" />
                ) : (
                  <FlaskConical className="w-5 h-5" />
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/80 border border-current/15">
                    {liveBannerAlert.type === 'queue_call' ? 'Panggilan Antrean Live' : 'Hasil Lab Baru'}
                  </span>
                  <span className="text-[11px] font-mono opacity-75">
                    {new Date(liveBannerAlert.createdAt).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <p className="text-sm font-extrabold">{liveBannerAlert.title}</p>
                <p className="text-xs opacity-90 leading-relaxed">{liveBannerAlert.body}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={() => handleMarkNotificationRead(liveBannerAlert)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition cursor-pointer"
              >
                {liveBannerAlert.type === 'lab_ready' ? 'Lihat Hasil Lab' : 'Lihat Antrean'}
              </button>
              <button
                type="button"
                aria-label="Tutup pemberitahuan"
                onClick={() => setLiveBannerAlert(null)}
                className="p-2 rounded-xl hover:bg-black/10 transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
        <AnimatePresence mode="wait" custom={tabDirection} initial={false}>
        {/* TAB 1: BERANDA (LIVE QUEUE + ALLERGIES + VITALS + INPATIENT) */}
        {activeTab === 'beranda' && (
          <motion.section
            key="beranda"
            custom={tabDirection}
            variants={fadeSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={fadeSlideTransition}
            className="grid grid-cols-1 lg:grid-cols-12 gap-5"
          >
            {/* Live Queue Ticket */}
            <div className="lg:col-span-7 space-y-4">
              {primaryQueue ? (
                <div className="rounded-3xl bg-gradient-to-br from-[#0B3D91] to-[#1E3163] text-white p-6 shadow-lg space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-sky-300">
                        Antrean Aktif Hari Ini
                      </p>
                      <h2 className="text-lg font-extrabold mt-0.5">{primaryQueue.poli}</h2>
                      <p className="text-xs text-blue-100 mt-0.5">{primaryQueue.dokter}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full bg-white/15 text-xs font-bold text-white whitespace-nowrap">
                      {primaryQueue.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-3 bg-white/10 rounded-2xl p-4 border border-white/10">
                    <div>
                      <p className="text-[11px] text-blue-200">Nomor Anda</p>
                      <p className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums mt-0.5">
                        {primaryQueue.nomor_antrian}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-blue-200">Sedang Dilayani</p>
                      <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-sky-300 mt-0.5">
                        {primaryQueue.poli_sedang_dipanggil}
                      </p>
                    </div>
                    <div>
                      <p className="text-[11px] text-blue-200">Estimasi Tunggu</p>
                      <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums mt-0.5">
                        {primaryQueue.estimasi_menit} mnt
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-blue-100">
                    <span className="font-mono tabular-nums">
                      {primaryQueue.tanggal} · {primaryQueue.jam_praktek}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowQrModal(true)}
                      className="font-bold text-white underline underline-offset-4 cursor-pointer"
                    >
                      Tunjukkan QR Check-In
                    </button>
                  </div>
                </div>
              ) : (
                <div className="rounded-3xl bg-white border border-slate-200 p-6 text-center space-y-3">
                  <CalendarPlus className="w-10 h-10 text-[#0B3D91] mx-auto" />
                  <h2 className="font-bold text-slate-900">Belum Ada Antrean Hari Ini</h2>
                  <p className="text-xs text-slate-600">
                    Jadwalkan konsultasi dokter spesialis langsung dari menu Jadwal &amp; Daftar.
                  </p>
                  <button
                    type="button"
                    onClick={() => switchTab('jadwal')}
                    className="px-5 py-2.5 rounded-xl bg-[#0B3D91] text-white text-xs font-bold cursor-pointer"
                  >
                    Cari Dokter &amp; Daftar Poli
                  </button>
                </div>
              )}

              {/* Additional Active Appointments */}
              {dossier.activeQueues.length > 1 && (
                <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Daftar Kunjungan Lainnya
                  </h3>
                  {dossier.activeQueues.slice(1).map((apt) => (
                    <div
                      key={apt.id}
                      className="flex items-center justify-between gap-3 py-2 border-t border-slate-100 first:border-t-0"
                    >
                      <div>
                        <p className="text-sm font-bold text-slate-900">{apt.poli}</p>
                        <p className="text-xs text-slate-600">
                          {apt.dokter} · <span className="font-mono">{apt.tanggal}</span>
                        </p>
                      </div>
                      <span className="font-mono tabular-nums text-sm font-extrabold text-[#0B3D91]">
                        {apt.nomor_antrian}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Inpatient Info if Admitted */}
              {dossier.inpatientStay && (
                <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-4 space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-indigo-800">
                    Status Rawat Inap Aktif
                  </p>
                  <p className="text-sm font-bold text-slate-900">
                    {dossier.inpatientStay.bangsal} · {dossier.inpatientStay.ruangan} ({dossier.inpatientStay.nomor_bed})
                  </p>
                  <p className="text-xs text-slate-600">
                    Kelas {dossier.inpatientStay.kelas} · Masuk{' '}
                    <span className="font-mono">{dossier.inpatientStay.tanggal_masuk || '-'}</span>
                  </p>
                </div>
              )}
            </div>

            {/* Right Column: Allergies, Latest Vitals, Quick Links */}
            <div className="lg:col-span-5 space-y-4">
              {dossier.allergies.length > 0 && (
                <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 space-y-2">
                  <p className="text-xs font-extrabold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4" />
                    Peringatan Alergi Tercatat
                  </p>
                  <ul className="space-y-1">
                    {dossier.allergies.map((al, i) => (
                      <li key={i} className="text-xs text-rose-900 font-semibold">
                        • {al.allergen} ({al.reaction})
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {dossier.vitalsLatest && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <HeartPulse className="w-4 h-4 text-[#0B3D91]" />
                      <span>Tanda Vital Terakhir</span>
                    </h3>
                    <span className="text-[11px] font-mono text-slate-500">
                      {dossier.vitalsLatest.date}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3">
                      <p className="text-[11px] text-slate-500">Tekanan Darah</p>
                      <p className="text-base font-extrabold font-mono tabular-nums text-slate-900 mt-0.5">
                        {dossier.vitalsLatest.bp} <span className="text-[10px] font-normal">mmHg</span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3">
                      <p className="text-[11px] text-slate-500">Nadi</p>
                      <p className="text-base font-extrabold font-mono tabular-nums text-slate-900 mt-0.5">
                        {dossier.vitalsLatest.hr} <span className="text-[10px] font-normal">x/mnt</span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3">
                      <p className="text-[11px] text-slate-500">Suhu Tubuh</p>
                      <p className="text-base font-extrabold font-mono tabular-nums text-slate-900 mt-0.5">
                        {dossier.vitalsLatest.temp} <span className="text-[10px] font-normal">°C</span>
                      </p>
                    </div>
                    <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3">
                      <p className="text-[11px] text-slate-500">Saturasi O₂</p>
                      <p className="text-base font-extrabold font-mono tabular-nums text-emerald-700 mt-0.5">
                        {dossier.vitalsLatest.spo2} <span className="text-[10px] font-normal">%</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    switchTab('hasil');
                    switchResultSubTab('lab');
                  }}
                  className="bg-white hover:border-[#0B3D91] border border-slate-200 rounded-2xl p-4 text-left transition cursor-pointer"
                >
                  <FlaskConical className="w-5 h-5 text-[#0B3D91] mb-2" />
                  <p className="text-sm font-bold text-slate-900">Hasil Lab &amp; Rad</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">
                    {dossier.labRadResults.length} Laporan
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => switchTab('tagihan')}
                  className="bg-white hover:border-[#0B3D91] border border-slate-200 rounded-2xl p-4 text-left transition cursor-pointer"
                >
                  <Receipt className="w-5 h-5 text-[#0B3D91] mb-2" />
                  <p className="text-sm font-bold text-slate-900">Status Tagihan</p>
                  <p className="text-xs font-semibold text-emerald-700 mt-0.5">
                    {dossier.billing.status}
                  </p>
                </button>
              </div>

              {/* FCM Real-Time Notification Status & One-Tap Activation Card */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div
                      className={`p-2 rounded-xl shrink-0 ${
                        fcmMode !== 'inactive' || sseConnected
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-blue-50 text-[#0B3D91]'
                      }`}
                    >
                      {fcmCapability?.permission === 'denied' ? (
                        <BellOff className="w-4 h-4 text-rose-600" />
                      ) : (
                        <BellRing className="w-4 h-4" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900">
                        Notifikasi Push Real-Time (FCM)
                      </h3>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                        Terima peringatan seketika saat nomor antrean dipanggil poli atau hasil laboratorium selesai divalidasi.
                      </p>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 ${
                      fcmMode === 'fcm_web_push'
                        ? 'bg-emerald-100 text-emerald-800'
                        : sseConnected
                        ? 'bg-sky-100 text-[#0B3D91]'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {fcmMode === 'fcm_web_push'
                      ? 'FCM Aktif'
                      : sseConnected
                      ? 'Live Aktif'
                      : 'Siap'}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {fcmCapability?.permission !== 'granted' || fcmMode === 'inactive' ? (
                    <button
                      type="button"
                      disabled={fcmSyncing}
                      onClick={handleEnableFcmNotifications}
                      className="flex-1 py-2.5 px-3.5 rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white text-xs font-bold cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
                    >
                      <BellRing className="w-3.5 h-3.5" />
                      <span>
                        {fcmSyncing ? 'Mengaktifkan FCM...' : 'Aktifkan Notifikasi Push FCM'}
                      </span>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowNotificationsModal(true)}
                    className="py-2.5 px-3.5 rounded-xl border border-slate-300 hover:border-[#0B3D91] bg-slate-50 text-slate-800 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#0B3D91]" />
                    <span>Kelola &amp; Uji Notifikasi ({notifications.length})</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {/* TAB 2: JADWAL & BOOKING DOKTER */}
        {activeTab === 'jadwal' && (
          <motion.section
            key="jadwal"
            custom={tabDirection}
            variants={fadeSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={fadeSlideTransition}
            className="space-y-4"
          >
            <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <h2 className="text-base font-extrabold text-slate-900">
                Cari Jadwal Dokter &amp; Ambil Antrean
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={docQuery}
                    onChange={(e) => setDocQuery(e.target.value)}
                    placeholder="Cari nama dokter atau spesialisasi..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-[#0B3D91]"
                  />
                </div>
                <select
                  value={selectedPoliId}
                  onChange={(e) => setSelectedPoliId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white outline-none focus:border-[#0B3D91]"
                >
                  <option value="ALL">Semua Poliklinik</option>
                  {poliklinikList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nama}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredDoctors.slice(0, 16).map((doc) => (
                <div
                  key={doc.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-3"
                >
                  <div>
                    <p className="text-xs font-bold text-[#0B3D91]">{doc.poli}</p>
                    <h3 className="font-bold text-slate-900 text-sm mt-0.5">{doc.nama}</h3>
                    <p className="text-xs text-slate-600 mt-0.5">{doc.spesialis}</p>
                    <p className="text-xs text-slate-500 font-mono tabular-nums mt-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {doc.hari || 'Senin - Jumat'} · {doc.jam || '08:00 - 14:00 WIB'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBookingDoc(doc)}
                    className="w-full py-2.5 rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white text-xs font-bold cursor-pointer min-h-[42px]"
                  >
                    Pilih &amp; Ambil Antrean
                  </button>
                </div>
              ))}
            </div>
          </motion.section>
        )}

        {/* TAB 3: HASIL MEDIS (RESUME, LAB/RAD, OBAT) */}
        {activeTab === 'hasil' && (
          <motion.section
            key="hasil"
            custom={tabDirection}
            variants={fadeSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={fadeSlideTransition}
            className="space-y-4"
          >
            <div className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-slate-200/70">
              {[
                { id: 'resume', label: 'Resume & Diagnosis' },
                { id: 'lab', label: 'Lab & Radiologi' },
                { id: 'obat', label: 'Resep Obat' }
              ].map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => switchResultSubTab(st.id as ResultSubTab)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-bold transition cursor-pointer min-h-[40px] ${
                    resultSubTab === st.id ? 'bg-white text-[#0B3D91] shadow-xs' : 'text-slate-600'
                  }`}
                >
                  {st.label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait" custom={subTabDirection} initial={false}>
            {resultSubTab === 'resume' && (
              <motion.div
                key="resume"
                custom={subTabDirection}
                variants={fadeSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={fadeSlideTransition}
                className="space-y-4"
              >
                <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                  <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                    <Stethoscope className="w-4 h-4 text-[#0B3D91]" />
                    <span>Daftar Diagnosis &amp; Riwayat Klinis</span>
                  </h3>
                  {dossier.problemList.length === 0 ? (
                    <p className="text-xs text-slate-500">Belum ada catatan diagnosis aktif.</p>
                  ) : (
                    <div className="space-y-2">
                      {dossier.problemList.map((pr, idx) => (
                        <div
                          key={idx}
                          className="rounded-xl bg-slate-50 border border-slate-200/70 p-3 flex items-center justify-between gap-3"
                        >
                          <div>
                            <p className="text-sm font-bold text-slate-900">{pr.nama}</p>
                            <p className="text-xs text-slate-500">
                              Derajat: {pr.severity} · Status: {pr.status}
                            </p>
                          </div>
                          <span className="font-mono text-xs font-bold text-[#0B3D91] shrink-0">
                            {pr.kode_icd10}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {dossier.clinicalResume && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
                      <div>
                        <p className="text-xs font-bold text-[#0B3D91]">
                          {dossier.clinicalResume.no_resume}
                        </p>
                        <h4 className="font-bold text-slate-900">
                          {dossier.clinicalResume.unit_pelayanan}
                        </h4>
                      </div>
                      <span className="text-xs font-semibold text-emerald-700">
                        {dossier.clinicalResume.kondisi_pulang}
                      </span>
                    </div>

                    <div>
                      <p className="text-xs font-bold text-slate-500">Keluhan &amp; Pemeriksaan</p>
                      <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                        {dossier.clinicalResume.keluhan_utama}. {dossier.clinicalResume.pemeriksaan_fisik}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-500">Anjuran &amp; Jadwal Kontrol</p>
                      <p className="text-xs text-slate-700 mt-1 leading-relaxed">
                        {dossier.clinicalResume.instruksi_edukasi} · Kontrol:{' '}
                        <strong>{dossier.clinicalResume.jadwal_kontrol}</strong>
                      </p>
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {resultSubTab === 'lab' && (
              <motion.div
                key="lab"
                custom={subTabDirection}
                variants={fadeSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={fadeSlideTransition}
                className="space-y-3"
              >
                {dossier.labRadResults.map((item) => (
                  <div
                    key={item.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-bold text-[#0B3D91]">
                          {item.jenis} · <span className="font-mono">{item.tanggal}</span>
                        </p>
                        <h4 className="text-sm font-extrabold text-slate-900 mt-0.5">
                          {item.pemeriksaan}
                        </h4>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 shrink-0">
                        {item.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100">
                      {item.hasil}
                    </p>
                    <p className="text-[11px] text-slate-500">DPJP / Pengirim: {item.dokter}</p>
                  </div>
                ))}
              </motion.div>
            )}

            {resultSubTab === 'obat' && (
              <motion.div
                key="obat"
                custom={subTabDirection}
                variants={fadeSlideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={fadeSlideTransition}
                className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3"
              >
                <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                  <Pill className="w-4 h-4 text-[#0B3D91]" />
                  <span>Terapi &amp; Resep Obat Aktif</span>
                </h3>
                {dossier.medications.map((med, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">{med.name}</p>
                      <p className="text-xs text-slate-600 mt-0.5">
                        {med.dose} · {med.frequency}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-emerald-700">{med.status}</span>
                  </div>
                ))}
              </motion.div>
            )}
            </AnimatePresence>
          </motion.section>
        )}

        {/* TAB 4: TAGIHAN, BPJS & PROFIL PWA */}
        {activeTab === 'tagihan' && (
          <motion.section
            key="tagihan"
            custom={tabDirection}
            variants={fadeSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={fadeSlideTransition}
            className="grid grid-cols-1 lg:grid-cols-12 gap-5"
          >
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                <div>
                  <p className="text-xs font-mono text-slate-500">
                    {dossier.billing.invoiceNumber}
                  </p>
                  <h3 className="text-base font-extrabold text-slate-900 mt-0.5">
                    Rincian Tagihan Layanan
                  </h3>
                </div>
                <span className="text-xs font-bold text-[#0B3D91] bg-blue-50 px-3 py-1 rounded-full">
                  {dossier.billing.status}
                </span>
              </div>

              <div className="space-y-2.5">
                {dossier.billing.items.map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between text-xs sm:text-sm">
                    <div>
                      <p className="font-semibold text-slate-800">{item.nama}</p>
                      <p className="text-[11px] text-slate-500">{item.kategori}</p>
                    </div>
                    <span className="font-mono tabular-nums font-bold text-slate-900">
                      {formatRupiah(item.nominal)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-200 space-y-1.5 text-sm">
                <div className="flex justify-between text-slate-600">
                  <span>Total Biaya Layanan</span>
                  <span className="font-mono tabular-nums font-semibold">
                    {formatRupiah(dossier.billing.totalBiaya)}
                  </span>
                </div>
                <div className="flex justify-between text-emerald-700">
                  <span>Ditanggung {dossier.billing.penjamin}</span>
                  <span className="font-mono tabular-nums font-semibold">
                    -{formatRupiah(dossier.billing.ditanggungPenjamin)}
                  </span>
                </div>
                <div className="flex justify-between text-base font-extrabold text-[#0B3D91] pt-2 border-t border-slate-100">
                  <span>Sisa Pembayaran Pasien</span>
                  <span className="font-mono tabular-nums">
                    {formatRupiah(dossier.billing.sisaTagihan)}
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
                <h3 className="text-sm font-extrabold text-slate-900">Identitas Terverifikasi</h3>
                <div className="text-xs space-y-1.5 text-slate-600">
                  <p>
                    Nama: <strong className="text-slate-900">{dossier.patient.nama}</strong>
                  </p>
                  <p>
                    No. RM:{' '}
                    <strong className="font-mono text-slate-900">{dossier.patient.no_rm}</strong>
                  </p>
                  <p>
                    Metode Masuk:{' '}
                    <strong className="text-[#0B3D91]">
                      {dossier.authMethod === 'google'
                        ? `Google (${dossier.linkedEmail})`
                        : 'Verifikasi No. RM + Tanggal Lahir'}
                    </strong>
                  </p>
                  <p>Golongan Darah: {dossier.patient.golongan_darah}</p>
                </div>

                <div className="pt-2 flex flex-wrap gap-2">
                  <PWAInstallButton variant="primary" label="Pasang Aplikasi (PWA)" showAlwaysGuide />
                </div>
              </div>

              <button
                type="button"
                onClick={handlePatientLogout}
                className="w-full py-3.5 rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer min-h-[48px]"
              >
                <LogOut className="w-4 h-4" />
                <span>Keluar Sesi Pasien</span>
              </button>
            </div>
          </motion.section>
        )}
        </AnimatePresence>
      </main>

      {/* Mobile Bottom Tab Bar (Fixed in Thumb Zone, hidden on md+ where top tabs show) */}
      <nav
        aria-label="Navigasi Aplikasi Pasien"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 px-2 py-1.5 grid grid-cols-4 gap-1 shadow-lg"
      >
        {[
          { id: 'beranda', label: 'Beranda', icon: Home },
          { id: 'jadwal', label: 'Jadwal', icon: CalendarPlus },
          { id: 'hasil', label: 'Hasil', icon: FileHeart },
          { id: 'tagihan', label: 'Tagihan', icon: Receipt }
        ].map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => switchTab(item.id as MobileTab)}
              className={`relative flex flex-col items-center justify-center py-1.5 rounded-xl min-h-[48px] transition-colors cursor-pointer ${
                isActive ? 'text-[#0B3D91] font-bold' : 'text-slate-500 font-medium'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="mobileBottomActiveTabPill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className="absolute inset-0 rounded-xl bg-blue-50"
                />
              )}
              <Icon className="w-5 h-5 relative z-10" />
              <span className="text-[11px] mt-0.5 relative z-10">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Modal QR Kartu Berobat Digital */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4">
          <div className="bg-white text-slate-900 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl">
            <h3 className="text-lg font-extrabold text-slate-900">Kartu Pasien &amp; Check-In QR</h3>
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 inline-block mx-auto">
              <QRCodeSVG
                value={JSON.stringify({
                  no_rm: dossier.patient.no_rm,
                  antrean: primaryQueue?.nomor_antrian || 'UMUM',
                  nama: dossier.patient.nama
                })}
                size={176}
              />
            </div>
            <div>
              <p className="font-bold text-slate-900">{dossier.patient.nama}</p>
              <p className="text-xs font-mono text-[#0B3D91] mt-0.5">
                {dossier.patient.no_rm} · {primaryQueue?.nomor_antrian || 'Terdaftar'}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Pindai QR ini pada Anjungan Mandiri (APM) saat tiba di rumah sakit.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full py-3 rounded-xl bg-[#0B3D91] text-white font-bold text-sm cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}

      {/* Modal Konfirmasi Booking dari Tab Jadwal Mobile */}
      {bookingDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4">
          <div className="bg-white text-slate-900 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-extrabold text-slate-900">Konfirmasi Janji Temu</h3>
            <div className="rounded-xl bg-blue-50 border border-blue-100 p-3.5 text-xs space-y-1">
              <p className="font-bold text-[#0B3D91]">{bookingDoc.poli}</p>
              <p className="font-bold text-slate-900 text-sm">{bookingDoc.nama}</p>
              <p className="font-mono text-slate-600">{bookingDoc.jam}</p>
            </div>

            <form onSubmit={handleMobileBooking} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Tanggal Periksa</label>
                <input
                  type="date"
                  required
                  value={bookingDate}
                  onChange={(e) => setBookingDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm outline-none focus:border-[#0B3D91]"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Penjamin Biaya</label>
                <select
                  value={bookingPenjamin}
                  onChange={(e) => setBookingPenjamin(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white outline-none"
                >
                  <option value="Umum / Mandiri">Umum / Mandiri</option>
                  <option value="BPJS Kesehatan">BPJS Kesehatan</option>
                  <option value="Asuransi Mandiri Inhealth">Asuransi Mandiri Inhealth</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Keluhan Singkat</label>
                <input
                  type="text"
                  value={bookingKeluhan}
                  onChange={(e) => setBookingKeluhan(e.target.value)}
                  placeholder="Contoh: Kontrol ulang & cek tensi"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setBookingDoc(null)}
                  className="py-3 rounded-xl bg-slate-100 text-slate-700 font-bold text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isBookingSubmitting}
                  className="py-3 rounded-xl bg-[#0B3D91] text-white font-bold text-xs cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{isBookingSubmitting ? 'Memproses...' : 'Ambil Antrean'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Pusat Notifikasi Real-Time & Pengaturan FCM */}
      {showNotificationsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-xs p-4">
          <div className="bg-white text-slate-900 rounded-3xl max-w-lg w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-[#0B3D91] text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <BellRing className="w-5 h-5 text-amber-300" />
                <div>
                  <h3 className="text-base font-extrabold">Pusat Notifikasi Real-Time (FCM)</h3>
                  <p className="text-[11px] text-blue-200">
                    Antrean Poli &amp; Hasil Laboratorium Tervalidasi
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Tutup Pusat Notifikasi"
                onClick={() => setShowNotificationsModal(false)}
                className="p-2 rounded-xl hover:bg-white/15 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {/* FCM Channel & Permission Status */}
              <div className="rounded-2xl bg-slate-50 border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                    Status Firebase Cloud Messaging
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                      fcmMode === 'fcm_web_push'
                        ? 'bg-emerald-100 text-emerald-800'
                        : sseConnected
                        ? 'bg-sky-100 text-[#0B3D91]'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {fcmMode === 'fcm_web_push'
                      ? 'FCM Web Push Aktif'
                      : sseConnected
                      ? 'Live Real-Time + Browser'
                      : 'Menghubungkan...'}
                  </span>
                </div>

                <div className="text-xs text-slate-600 space-y-1">
                  <p>
                    Izin Browser:{' '}
                    <strong className="text-slate-900">
                      {fcmCapability?.permission === 'granted'
                        ? 'Diizinkan (Granted)'
                        : fcmCapability?.permission === 'denied'
                        ? 'Diblokir Browser (Aktifkan di Setelan Situs)'
                        : 'Belum Diminta'}
                    </strong>
                  </p>
                  {fcmTokenPreview && (
                    <p className="font-mono text-[11px] text-slate-500 truncate">
                      Device Token: {fcmTokenPreview.slice(0, 28)}...
                    </p>
                  )}
                  {fcmCapability && !fcmCapability.hasVapidKey && (
                    <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-1">
                      Saluran real-time SSE &amp; notifikasi browser aktif. Tambahkan{' '}
                      <code className="font-mono font-bold">VITE_FIREBASE_VAPID_KEY</code> dari Firebase Console untuk web push saat tab tertutup.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={fcmSyncing}
                  onClick={handleEnableFcmNotifications}
                  className="w-full py-2.5 rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white text-xs font-bold cursor-pointer disabled:opacity-60"
                >
                  {fcmSyncing
                    ? 'Menyinkronkan Token Perangkat...'
                    : fcmCapability?.permission === 'granted'
                    ? 'Sinkronkan Ulang Token Perangkat FCM'
                    : 'Aktifkan Izin Notifikasi Push FCM'}
                </button>

                {/* Alert Type Toggles */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleToggleAlertPreference('queue')}
                    className={`px-3 py-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                      queueAlertsEnabled
                        ? 'bg-white border-[#0B3D91]/40 text-slate-900'
                        : 'bg-slate-100 border-slate-200 text-slate-500'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold">Antrean Dipanggil</p>
                      <p className="text-[10px] opacity-75">Alert saat poli memanggil</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        queueAlertsEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {queueAlertsEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleToggleAlertPreference('lab')}
                    className={`px-3 py-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                      labAlertsEnabled
                        ? 'bg-white border-[#0B3D91]/40 text-slate-900'
                        : 'bg-slate-100 border-slate-200 text-slate-500'
                    }`}
                  >
                    <div>
                      <p className="text-xs font-bold">Hasil Lab Tersedia</p>
                      <p className="text-[10px] opacity-75">Alert validasi Sp.PK</p>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                        labAlertsEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {labAlertsEnabled ? 'ON' : 'OFF'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Interactive Simulation Buttons */}
              <div className="space-y-2">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                  Uji Coba Notifikasi Real-Time Langsung
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={simulatingType !== null}
                    onClick={() => handleSimulatePush('queue_call')}
                    className="py-2.5 px-3 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>
                      {simulatingType === 'queue_call' ? 'Mengirim...' : 'Simulasi Antrean Dipanggil'}
                    </span>
                  </button>
                  <button
                    type="button"
                    disabled={simulatingType !== null}
                    onClick={() => handleSimulatePush('lab_ready')}
                    className="py-2.5 px-3 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-bold cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    <FlaskConical className="w-3.5 h-3.5" />
                    <span>
                      {simulatingType === 'lab_ready' ? 'Mengirim...' : 'Simulasi Hasil Lab Tersedia'}
                    </span>
                  </button>
                </div>
              </div>

              {/* Notification Inbox List */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-extrabold text-slate-700">
                    Riwayat Notifikasi ({notifications.length})
                  </p>
                  {unreadCount > 0 && (
                    <button
                      type="button"
                      onClick={handleMarkAllRead}
                      className="text-xs font-bold text-[#0B3D91] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Tandai Semua Dibaca</span>
                    </button>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center space-y-1.5">
                    <Bell className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="text-xs font-bold text-slate-700">Belum Ada Notifikasi Masuk</p>
                    <p className="text-[11px] text-slate-500">
                      Notifikasi akan muncul otomatis saat dokter/admin memanggil antrean Anda atau Sp.PK memvalidasi hasil laboratorium.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {notifications.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleMarkNotificationRead(item)}
                        className={`w-full text-left rounded-2xl border p-3.5 transition cursor-pointer space-y-1 ${
                          item.read
                            ? 'bg-white border-slate-200 text-slate-700'
                            : 'bg-blue-50/70 border-[#0B3D91]/30 text-slate-900 shadow-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span
                            className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                              item.type === 'queue_call'
                                ? 'bg-amber-100 text-amber-800'
                                : item.type === 'lab_ready'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {item.type === 'queue_call'
                              ? 'Antrean Poli'
                              : item.type === 'lab_ready'
                              ? 'Hasil Laboratorium'
                              : 'Sistem'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-500">
                            {new Date(item.createdAt).toLocaleTimeString('id-ID', {
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </span>
                        </div>
                        <p className="text-xs font-extrabold flex items-center gap-1.5">
                          {!item.read && <span className="w-2 h-2 rounded-full bg-[#0B3D91] shrink-0" />}
                          <span>{item.title}</span>
                        </p>
                        <p className="text-xs opacity-85 leading-relaxed">{item.body}</p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
    </MotionConfig>
  );
};
