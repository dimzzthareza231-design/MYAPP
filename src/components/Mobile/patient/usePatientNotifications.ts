import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { auth } from '../../../lib/firebase';
import type { PatientDossierPayload } from './types';
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
  type FcmCapabilityStatus,
  type PatientNotificationItem
} from '../../../lib/fcm';

export type FcmMode = 'fcm_web_push' | 'realtime_sse_fallback' | 'inactive';

const MAX_NOTIFICATIONS = 40;

/**
 * Status notifikasi pasien: kotak masuk dari server, FCM Web Push (bila dikonfigurasi),
 * aliran SSE, dan sinkronisasi Firestore untuk akun Google.
 */
export function usePatientNotifications(params: {
  token: string | null;
  noRm: string | undefined;
  authMethod: PatientDossierPayload['authMethod'] | undefined;
  onRealtimeUpdate: () => void;
}) {
  const { token, noRm, authMethod, onRealtimeUpdate } = params;

  const initialPrefs = useMemo(() => getCachedFcmPrefs(), []);
  const [notifications, setNotifications] = useState<PatientNotificationItem[]>([]);
  const [liveBannerAlert, setLiveBannerAlert] = useState<PatientNotificationItem | null>(null);
  const [fcmCapability, setFcmCapability] = useState<FcmCapabilityStatus | null>(null);
  const [fcmMode, setFcmMode] = useState<FcmMode>('inactive');
  const [fcmSyncing, setFcmSyncing] = useState(false);
  const [sseConnected, setSseConnected] = useState(false);
  const [simulatingType, setSimulatingType] = useState<'queue_call' | 'lab_ready' | null>(null);
  const [queueAlertsEnabled, setQueueAlertsEnabled] = useState<boolean>(initialPrefs.queueAlertsEnabled);
  const [labAlertsEnabled, setLabAlertsEnabled] = useState<boolean>(initialPrefs.labAlertsEnabled);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const firestoreInitializedRef = useRef<boolean>(false);
  const onRealtimeUpdateRef = useRef(onRealtimeUpdate);
  onRealtimeUpdateRef.current = onRealtimeUpdate;

  const unreadCount = useMemo(() => notifications.filter((item) => !item.read).length, [notifications]);

  const handleIncomingRealtimeAlert = useCallback((incoming: PatientNotificationItem, announce = true) => {
    if (!incoming || !incoming.id) return;
    if (seenNotifIdsRef.current.has(incoming.id)) return;
    seenNotifIdsRef.current.add(incoming.id);

    setNotifications((prev) => {
      const filtered = prev.filter((item) => item.id !== incoming.id);
      return [incoming, ...filtered].slice(0, MAX_NOTIFICATIONS);
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
      onRealtimeUpdateRef.current();
    }
  }, []);

  useEffect(() => {
    if (!token || !noRm) {
      setSseConnected(false);
      return;
    }

    let cancelled = false;
    let unsubscribeForeground: (() => void) | null = null;
    let unsubscribeFirestore: (() => void) | null = null;
    let eventSource: EventSource | null = null;

    (async () => {
      const cap = await checkFcmCapability();
      if (cancelled) return;
      setFcmCapability(cap);

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
            setNotifications(notifData.notifications.slice(0, MAX_NOTIFICATIONS));
          }
        }
      } catch {
        // Kotak masuk tetap kosong bila server tidak dapat dihubungi.
      }

      if (cap.permission === 'granted' || getCachedFcmToken()) {
        const reg = await registerFcmForPatient({
          no_rm: noRm,
          patientToken: token,
          queueAlertsEnabled,
          labAlertsEnabled,
          promptPermission: false
        });
        if (!cancelled) setFcmMode(reg.mode);
      }

      unsubscribeForeground = await subscribeForegroundFcm((payload) => {
        const data = (payload.data || {}) as Record<string, string>;
        const title = payload.notification?.title || data.title || 'Notifikasi MYITARU';
        const body = payload.notification?.body || data.body || '';
        const notifType = data.type === 'queue_call' || data.type === 'lab_ready' ? data.type : 'system';

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
      if (cancelled) {
        unsubscribeForeground?.();
        return;
      }

      if (authMethod === 'google' && auth?.currentUser?.emailVerified && auth?.currentUser?.uid) {
        firestoreInitializedRef.current = false;
        unsubscribeFirestore = subscribeFirestorePatientNotifications(auth.currentUser.uid, (fsItems) => {
          if (!firestoreInitializedRef.current) {
            firestoreInitializedRef.current = true;
            fsItems.forEach((item) => {
              if (!seenNotifIdsRef.current.has(item.id)) {
                seenNotifIdsRef.current.add(item.id);
                setNotifications((prev) => [item, ...prev].slice(0, MAX_NOTIFICATIONS));
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

    if (typeof EventSource !== 'undefined') {
      eventSource = new EventSource('/api/patient/notifications/stream');
      eventSource.onopen = () => {
        if (!cancelled) setSseConnected(true);
      };
      eventSource.addEventListener('patient_notification', (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data) as PatientNotificationItem;
          handleIncomingRealtimeAlert(parsed, true);
        } catch {
          // Abaikan payload yang tidak valid.
        }
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
  }, [token, noRm, authMethod, queueAlertsEnabled, labAlertsEnabled, handleIncomingRealtimeAlert]);

  const enableNotifications = useCallback(async () => {
    if (!token || !noRm) return;
    setFcmSyncing(true);
    try {
      const result = await registerFcmForPatient({
        no_rm: noRm,
        patientToken: token,
        queueAlertsEnabled,
        labAlertsEnabled,
        promptPermission: true
      });
      setFcmCapability(await checkFcmCapability());
      setFcmMode(result.mode);
      toast.success(result.message);
    } catch {
      toast.error('Gagal mengaktifkan notifikasi.');
    } finally {
      setFcmSyncing(false);
    }
  }, [token, noRm, queueAlertsEnabled, labAlertsEnabled]);

  const toggleAlertPreference = useCallback(
    async (target: 'queue' | 'lab') => {
      const nextQueue = target === 'queue' ? !queueAlertsEnabled : queueAlertsEnabled;
      const nextLab = target === 'lab' ? !labAlertsEnabled : labAlertsEnabled;
      setQueueAlertsEnabled(nextQueue);
      setLabAlertsEnabled(nextLab);

      if (token && noRm) {
        const reg = await registerFcmForPatient({
          no_rm: noRm,
          patientToken: token,
          queueAlertsEnabled: nextQueue,
          labAlertsEnabled: nextLab,
          promptPermission: false
        });
        setFcmMode(reg.mode);
        toast.success('Preferensi notifikasi disimpan.');
      }
    },
    [token, noRm, queueAlertsEnabled, labAlertsEnabled]
  );

  const markRead = useCallback(
    (item: PatientNotificationItem) => {
      setNotifications((prev) => prev.map((n) => (n.id === item.id ? { ...n, read: true } : n)));
      setLiveBannerAlert((current) => (current?.id === item.id ? null : current));
      if (token) {
        fetch('/api/patient/notifications/read', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: item.id })
        }).catch(() => {});
      }
      if (authMethod === 'google' && auth?.currentUser?.emailVerified) {
        markFirestoreNotificationRead(item.id).catch(() => {});
      }
    },
    [token, authMethod]
  );

  const markAllRead = useCallback(() => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setLiveBannerAlert(null);
    if (token) {
      fetch('/api/patient/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ markAll: true })
      }).catch(() => {});
    }
    if (authMethod === 'google' && auth?.currentUser?.emailVerified) {
      unreadIds.forEach((id) => {
        markFirestoreNotificationRead(id).catch(() => {});
      });
    }
    toast.success('Semua notifikasi ditandai sudah dibaca.');
  }, [notifications, token, authMethod]);

  /** Hanya tersedia di mode pengembangan (lihat NotificationsModal). */
  const simulatePush = useCallback(
    async (type: 'queue_call' | 'lab_ready') => {
      if (!token) return;
      setSimulatingType(type);
      try {
        const res = await fetch('/api/patient/notifications/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ type })
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          toast.error(data?.message || 'Gagal menjalankan simulasi notifikasi.');
          return;
        }
        if (data.notification) handleIncomingRealtimeAlert(data.notification, true);
      } catch {
        toast.error('Koneksi bermasalah saat mengirim uji notifikasi.');
      } finally {
        setSimulatingType(null);
      }
    },
    [token, handleIncomingRealtimeAlert]
  );

  const reset = useCallback(() => {
    setNotifications([]);
    setLiveBannerAlert(null);
    setFcmMode('inactive');
    seenNotifIdsRef.current.clear();
  }, []);

  return {
    notifications,
    unreadCount,
    liveBannerAlert,
    dismissLiveBanner: () => setLiveBannerAlert(null),
    fcmCapability,
    fcmMode,
    fcmSyncing,
    sseConnected,
    simulatingType,
    queueAlertsEnabled,
    labAlertsEnabled,
    enableNotifications,
    toggleAlertPreference,
    markRead,
    markAllRead,
    simulatePush,
    reset
  };
}

export type PatientNotificationsState = ReturnType<typeof usePatientNotifications>;
