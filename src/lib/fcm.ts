import {
  getMessaging,
  getToken,
  isSupported,
  onMessage,
  type Messaging,
  type MessagePayload
} from 'firebase/messaging';
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe
} from 'firebase/firestore';
import type { UserInfo } from 'firebase/auth';
import app, { auth, db, isFirebaseConfigured } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write'
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: Array<{
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }>;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): FirestoreErrorInfo {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth?.currentUser?.uid,
      email: auth?.currentUser?.email,
      emailVerified: auth?.currentUser?.emailVerified,
      isAnonymous: auth?.currentUser?.isAnonymous,
      tenantId: auth?.currentUser?.tenantId,
      providerInfo:
        auth?.currentUser?.providerData?.map((provider: UserInfo) => ({
          providerId: provider.providerId,
          displayName: provider.displayName,
          email: provider.email,
          photoUrl: provider.photoURL
        })) || []
    },
    operationType,
    path
  };
  console.error('[Firestore Error]', JSON.stringify(errInfo));
  return errInfo;
}

export type NotificationType = 'queue_call' | 'lab_ready' | 'system';

export interface PatientNotificationItem {
  id: string;
  no_rm: string;
  recipientUid?: string;
  type: NotificationType;
  title: string;
  body: string;
  poli?: string;
  nomor_antrian?: string;
  lab_order_id?: string;
  channel: 'fcm_push' | 'fcm_foreground' | 'sse_realtime' | 'firestore_realtime';
  read: boolean;
  createdAt: string;
}

export interface FcmCapabilityStatus {
  browserSupported: boolean;
  messagingSupported: boolean;
  permission: NotificationPermission | 'unsupported';
  hasVapidKey: boolean;
  serviceWorkerAvailable: boolean;
  isStandalonePwa: boolean;
}

const VAPID_KEY = (import.meta.env.VITE_FIREBASE_VAPID_KEY || '').trim();
const LOCAL_FCM_TOKEN_STORAGE_KEY = 'myitaru_patient_fcm_token';
const LOCAL_FCM_PREFS_STORAGE_KEY = 'myitaru_patient_fcm_prefs';

function detectPlatform(): 'web' | 'pwa' | 'android' | 'ios' {
  if (typeof window === 'undefined') return 'web';
  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (window.navigator as { standalone?: boolean }).standalone === true;
  if (isStandalone) return 'pwa';
  const ua = navigator.userAgent.toLowerCase();
  if (/iphone|ipad|ipod/.test(ua)) return 'ios';
  if (/android/.test(ua)) return 'android';
  return 'web';
}

function buildSafeDocId(prefix: string, raw: string): string {
  const sanitized = raw.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
  return `${prefix}_${sanitized || 'default'}`;
}

export async function checkFcmCapability(): Promise<FcmCapabilityStatus> {
  if (typeof window === 'undefined') {
    return {
      browserSupported: false,
      messagingSupported: false,
      permission: 'unsupported',
      hasVapidKey: Boolean(VAPID_KEY),
      serviceWorkerAvailable: false,
      isStandalonePwa: false
    };
  }

  const notificationSupported = 'Notification' in window;
  const serviceWorkerAvailable = 'serviceWorker' in navigator;
  let messagingSupported = false;

  if (isFirebaseConfigured && app && notificationSupported && serviceWorkerAvailable) {
    try {
      messagingSupported = await isSupported();
    } catch {
      messagingSupported = false;
    }
  }

  const isStandalonePwa =
    Boolean(window.matchMedia?.('(display-mode: standalone)').matches) ||
    (window.navigator as { standalone?: boolean }).standalone === true;

  return {
    browserSupported: notificationSupported,
    messagingSupported,
    permission: notificationSupported ? Notification.permission : 'unsupported',
    hasVapidKey: Boolean(VAPID_KEY),
    serviceWorkerAvailable,
    isStandalonePwa
  };
}

export function getCachedFcmToken(): string | null {
  try {
    return localStorage.getItem(LOCAL_FCM_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getCachedFcmPrefs(): { queueAlertsEnabled: boolean; labAlertsEnabled: boolean } {
  try {
    const raw = localStorage.getItem(LOCAL_FCM_PREFS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        queueAlertsEnabled: parsed.queueAlertsEnabled !== false,
        labAlertsEnabled: parsed.labAlertsEnabled !== false
      };
    }
  } catch {
    // Ignore storage read errors
  }
  return { queueAlertsEnabled: true, labAlertsEnabled: true };
}

export function saveCachedFcmPrefs(prefs: { queueAlertsEnabled: boolean; labAlertsEnabled: boolean }) {
  try {
    localStorage.setItem(LOCAL_FCM_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Ignore storage write errors
  }
}

async function getMessagingInstance(): Promise<Messaging | null> {
  if (!isFirebaseConfigured || !app || typeof window === 'undefined') return null;
  try {
    const supported = await isSupported();
    if (!supported) return null;
    return getMessaging(app);
  } catch {
    return null;
  }
}

async function registerFcmServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return undefined;
  }
  try {
    const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
      scope: '/firebase-cloud-messaging-push-scope'
    });
    return registration;
  } catch (err) {
    console.warn('[FCM] Service worker registration skipped/fallback:', err);
    return undefined;
  }
}

export async function syncFcmTokenToFirestore(params: {
  no_rm: string;
  token: string;
  queueAlertsEnabled: boolean;
  labAlertsEnabled: boolean;
  active?: boolean;
}): Promise<void> {
  const currentUser = auth?.currentUser;
  if (!isFirebaseConfigured || !db || !currentUser || !currentUser.emailVerified) {
    return;
  }

  const docId = buildSafeDocId(`fcm_${currentUser.uid.slice(0, 24)}`, params.no_rm);
  const path = `fcm_tokens/${docId}`;
  const docRef = doc(db, 'fcm_tokens', docId);
  const nowIso = new Date().toISOString().slice(0, 64);

  try {
    const existingSnap = await getDoc(docRef);
    const platform = detectPlatform();
    const userAgent = (typeof navigator !== 'undefined' ? navigator.userAgent : 'web').slice(0, 290);

    if (existingSnap.exists()) {
      await updateDoc(docRef, {
        token: params.token.slice(0, 510),
        platform,
        userAgent,
        queueAlertsEnabled: params.queueAlertsEnabled,
        labAlertsEnabled: params.labAlertsEnabled,
        active: params.active !== false,
        updatedAt: nowIso
      });
    } else {
      await setDoc(docRef, {
        id: docId,
        uid: currentUser.uid,
        no_rm: params.no_rm.slice(0, 40),
        token: params.token.slice(0, 510),
        platform,
        userAgent,
        queueAlertsEnabled: params.queueAlertsEnabled,
        labAlertsEnabled: params.labAlertsEnabled,
        active: params.active !== false,
        updatedAt: nowIso
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function registerFcmForPatient(params: {
  no_rm: string;
  patientToken: string;
  queueAlertsEnabled: boolean;
  labAlertsEnabled: boolean;
  promptPermission?: boolean;
}): Promise<{
  success: boolean;
  fcmToken: string;
  mode: 'fcm_web_push' | 'realtime_sse_fallback';
  permission: NotificationPermission | 'unsupported';
  message: string;
}> {
  const capability = await checkFcmCapability();
  let permission = capability.permission;

  if (params.promptPermission && capability.browserSupported && permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch {
      permission = Notification.permission;
    }
  }

  let resolvedToken = '';
  let mode: 'fcm_web_push' | 'realtime_sse_fallback' = 'realtime_sse_fallback';

  if (capability.messagingSupported && permission === 'granted' && VAPID_KEY) {
    try {
      const messaging = await getMessagingInstance();
      const swReg = await registerFcmServiceWorker();
      if (messaging) {
        const fcmToken = await getToken(messaging, {
          vapidKey: VAPID_KEY,
          serviceWorkerRegistration: swReg
        });
        if (fcmToken) {
          resolvedToken = fcmToken;
          mode = 'fcm_web_push';
        }
      }
    } catch (err) {
      console.warn('[FCM] getToken failed, using real-time SSE + browser Notification fallback:', err);
    }
  } else if (capability.messagingSupported && permission === 'granted') {
    // Register SW so browser notification delivery works immediately even before VAPID key is configured
    await registerFcmServiceWorker();
  }

  if (!resolvedToken) {
    const existingCached = getCachedFcmToken();
    const randomSuffix =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID().replace(/-/g, '')
        : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    resolvedToken = existingCached || `fcm_sse_${params.no_rm.replace(/[^a-zA-Z0-9]/g, '')}_${randomSuffix}`;
  }

  try {
    localStorage.setItem(LOCAL_FCM_TOKEN_STORAGE_KEY, resolvedToken);
  } catch {
    // Ignore storage quota issues
  }
  saveCachedFcmPrefs({
    queueAlertsEnabled: params.queueAlertsEnabled,
    labAlertsEnabled: params.labAlertsEnabled
  });

  // Register on SIMK Patient Backend Hub
  try {
    await fetch('/api/patient/fcm-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${params.patientToken}`
      },
      body: JSON.stringify({
        token: resolvedToken,
        mode,
        platform: detectPlatform(),
        queueAlertsEnabled: params.queueAlertsEnabled,
        labAlertsEnabled: params.labAlertsEnabled
      })
    });
  } catch (err) {
    console.warn('[FCM] Backend token sync skipped:', err);
  }

  // Sync to Cloud Firestore when patient is signed in with Google Auth
  await syncFcmTokenToFirestore({
    no_rm: params.no_rm,
    token: resolvedToken,
    queueAlertsEnabled: params.queueAlertsEnabled,
    labAlertsEnabled: params.labAlertsEnabled,
    active: true
  });

  const message =
    mode === 'fcm_web_push'
      ? 'Notifikasi aktif untuk panggilan antrean & hasil lab.'
      : permission === 'granted'
      ? 'Notifikasi aktif selama aplikasi terbuka.'
      : permission === 'denied'
      ? 'Izin notifikasi browser diblokir. Notifikasi tetap tampil di dalam aplikasi.'
      : 'Notifikasi dalam aplikasi aktif.';

  return {
    success: true,
    fcmToken: resolvedToken,
    mode,
    permission,
    message
  };
}

export async function unregisterFcmForPatient(patientToken: string | null, noRm?: string): Promise<void> {
  const fcmToken = getCachedFcmToken();
  if (patientToken && fcmToken) {
    try {
      await fetch('/api/patient/fcm-token', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${patientToken}`
        },
        body: JSON.stringify({ token: fcmToken })
      });
    } catch {
      // Non-blocking cleanup
    }
  }

  if (noRm && fcmToken && auth?.currentUser?.emailVerified) {
    await syncFcmTokenToFirestore({
      no_rm: noRm,
      token: fcmToken,
      queueAlertsEnabled: false,
      labAlertsEnabled: false,
      active: false
    });
  }
}

export async function subscribeForegroundFcm(
  onPayload: (payload: MessagePayload) => void
): Promise<() => void> {
  const messaging = await getMessagingInstance();
  if (!messaging) {
    return () => {};
  }
  const unsubscribe = onMessage(messaging, (payload) => {
    onPayload(payload);
  });
  return unsubscribe;
}

export function subscribeFirestorePatientNotifications(
  recipientUid: string,
  onNotifications: (items: PatientNotificationItem[]) => void
): Unsubscribe {
  if (!isFirebaseConfigured || !db || !recipientUid) {
    return () => {};
  }
  const q = query(
    collection(db, 'patient_notifications'),
    where('recipientUid', '==', recipientUid)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const items: PatientNotificationItem[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: String(data.id || d.id),
          no_rm: String(data.no_rm || ''),
          recipientUid: String(data.recipientUid || recipientUid),
          type: (data.type as NotificationType) || 'system',
          title: String(data.title || 'Notifikasi Klinik'),
          body: String(data.body || ''),
          poli: data.poli ? String(data.poli) : undefined,
          nomor_antrian: data.nomor_antrian ? String(data.nomor_antrian) : undefined,
          lab_order_id: data.lab_order_id ? String(data.lab_order_id) : undefined,
          channel: data.channel || 'firestore_realtime',
          read: Boolean(data.read),
          createdAt: String(data.createdAt || new Date().toISOString())
        };
      });
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onNotifications(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.LIST, 'patient_notifications');
    }
  );
}

export async function syncNotificationToFirestoreIfSignedIn(
  item: PatientNotificationItem
): Promise<void> {
  const currentUser = auth?.currentUser;
  if (!isFirebaseConfigured || !db || !currentUser || !currentUser.emailVerified) {
    return;
  }
  const docId = buildSafeDocId('notif', item.id);
  const path = `patient_notifications/${docId}`;
  try {
    await setDoc(doc(db, 'patient_notifications', docId), {
      id: docId,
      no_rm: item.no_rm.slice(0, 40),
      recipientUid: currentUser.uid,
      type: item.type,
      title: item.title.slice(0, 160),
      body: item.body.slice(0, 500),
      ...(item.poli ? { poli: item.poli.slice(0, 120) } : {}),
      ...(item.nomor_antrian ? { nomor_antrian: item.nomor_antrian.slice(0, 32) } : {}),
      ...(item.lab_order_id ? { lab_order_id: item.lab_order_id.slice(0, 64) } : {}),
      channel: item.channel,
      read: Boolean(item.read),
      createdAt: item.createdAt.slice(0, 64)
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function markFirestoreNotificationRead(notifId: string): Promise<void> {
  const currentUser = auth?.currentUser;
  if (!isFirebaseConfigured || !db || !currentUser || !currentUser.emailVerified) {
    return;
  }
  const docId = notifId.startsWith('notif_') ? notifId : buildSafeDocId('notif', notifId);
  const path = `patient_notifications/${docId}`;
  try {
    await updateDoc(doc(db, 'patient_notifications', docId), { read: true });
  } catch (error) {
    // Only log cleanly if document wasn't a purely SSE notification
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function showNativeBrowserNotification(item: {
  id: string;
  title: string;
  body: string;
  type: NotificationType;
}): Promise<void> {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  const targetUrl = item.type === 'lab_ready' ? '/mobile?tab=hasil' : '/mobile?tab=beranda';
  const options: NotificationOptions = {
    body: item.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    tag: `myitaru-${item.id}`,
    requireInteraction: item.type === 'queue_call',
    data: { url: targetUrl, type: item.type }
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration('/firebase-cloud-messaging-push-scope');
      if (reg && 'showNotification' in reg) {
        await reg.showNotification(item.title, options);
        return;
      }
    }
    const notif = new Notification(item.title, options);
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
  } catch {
    // Fallback quietly if browser blocks programmatic Notification outside SW context
  }
}

export function playClinicalNotificationChime(type: NotificationType = 'queue_call'): void {
  if (typeof window === 'undefined') return;
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return;

  try {
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes = type === 'queue_call' ? [587.33, 880, 1046.5] : [523.25, 659.25];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.12);
      gain.gain.setValueAtTime(0.001, now + idx * 0.12);
      gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.12 + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.12);
      osc.stop(now + idx * 0.12 + 0.26);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 900);
  } catch {
    // Ignore autoplay AudioContext restrictions before user gesture
  }
}
