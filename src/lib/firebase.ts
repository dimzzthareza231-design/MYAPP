import { initializeApp, getApps } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
// No fallback to the template's committed Firebase project.
export const isFirebaseConfigured = !!(config.apiKey && config.authDomain && config.projectId && config.appId);
const app = isFirebaseConfigured ? (getApps()[0] || initializeApp(config)) : null;
export const auth = app ? getAuth(app) : (null as any);
export const db = app ? getFirestore(app, import.meta.env.VITE_FIREBASE_DATABASE_ID || '(default)') : (null as any);
export const googleProvider = app ? new GoogleAuthProvider() : (null as any);
googleProvider?.setCustomParameters({ prompt: 'select_account' });
export default app;
