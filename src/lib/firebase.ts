// Firebase is only used for FCM web push (firebase/messaging) and the patient portal's Google sign-in.
// Staff auth and all core data go through the server (/api/*).
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import appletConfig from '../../firebase-applet-config.json';

const apiKey = import.meta.env.VITE_FIREBASE_API_KEY || appletConfig?.apiKey;
const authDomain = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || appletConfig?.authDomain;
const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || appletConfig?.projectId;
const storageBucket = import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || appletConfig?.storageBucket;
const messagingSenderId = import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || appletConfig?.messagingSenderId;
const appId = import.meta.env.VITE_FIREBASE_APP_ID || appletConfig?.appId;

const firebaseConfig = {
  apiKey,
  authDomain,
  projectId,
  storageBucket,
  messagingSenderId,
  appId
};

// Only initialize if config exists to prevent app crash
export const isFirebaseConfigured = !!(firebaseConfig.apiKey && firebaseConfig.projectId);

const app = isFirebaseConfigured ? (getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]) : (null as any);
export const auth = isFirebaseConfigured ? getAuth(app) : (null as any);
export const googleProvider = isFirebaseConfigured ? new GoogleAuthProvider() : (null as any);

if (isFirebaseConfigured && googleProvider) {
  googleProvider.setCustomParameters({
    prompt: 'select_account'
  });
}

export default app;
