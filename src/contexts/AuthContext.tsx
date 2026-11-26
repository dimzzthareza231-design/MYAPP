import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { 
  User as FirebaseUser,
  onAuthStateChanged, 
  signInWithPopup, 
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut as firebaseSignOut,
  setPersistence,
  browserLocalPersistence,
  getMultiFactorResolver,
  multiFactor,
  TotpMultiFactorGenerator,
  type MultiFactorError,
  type MultiFactorResolver,
  type TotpSecret
} from 'firebase/auth';
import { doc, getDoc, setDoc, onSnapshot, collection, deleteDoc } from 'firebase/firestore';
import { auth, db, googleProvider, isFirebaseConfigured, isLocalAuthMode } from '../lib/firebase';
import { stopModuleSync } from '../lib/moduleSync';
import { logAuthAttempt } from '../lib/activityLogger';
import { hasModuleAccess, getRoleById } from '../data/roles';

export interface User {
  id: string;
  username: string;
  password?: string;
  nama: string;
  roleId: string;
  email: string;
  photoURL?: string;
  aktif: boolean;
  dibuatPada: string;
  isGoogleAuth?: boolean;
}

interface AuthContextType {
  currentUser: User | null;
  firebaseUser: FirebaseUser | null;
  users: User[];
  loading: boolean;
  isReadOnly: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; message: string; mfaFlow?: 'enrollment' | 'challenge' }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  mfaFlow: MfaFlow | null;
  completeMfa: (code: string) => Promise<{ success: boolean; message: string }>;
  completeMfaEnrollment: (code: string) => Promise<{ success: boolean; message: string; reauthenticationRequired?: boolean }>;
  cancelMfa: () => Promise<void>;
  signInWithGoogle: () => Promise<{ success: boolean; message: string; isCancelled?: boolean }>;
  logout: () => Promise<void>;
  hasAccess: (moduleId: string) => boolean;
  isAdmin: boolean;
  // User management
  addUser: (user: Omit<User, 'id' | 'dibuatPada'>) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type MfaFlow =
  | { type: 'enrollment'; qrCodeUrl: string; secretKey: string }
  | { type: 'challenge' };

function parseLocalUser(value: unknown): User | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.username !== 'string' ||
      typeof record.nama !== 'string' || typeof record.email !== 'string' ||
      typeof record.roleId !== 'string' || record.aktif !== true) {
    return null;
  }
  if (!getRoleById(record.roleId)) return null;
  return {
    id: record.id,
    username: record.username,
    nama: record.nama,
    email: record.email,
    roleId: record.roleId,
    aktif: true,
    dibuatPada: typeof record.dibuatPada === 'string' ? record.dibuatPada : ''
  };
}

async function loadAuthorizedProfile(firebaseUser: FirebaseUser, issueServerSession = true): Promise<User> {
  if (!firebaseUser.email || !firebaseUser.emailVerified) {
    throw new Error('Gunakan email terverifikasi yang telah didaftarkan administrator.');
  }

  const profileSnapshot = await getDoc(doc(db, 'users', firebaseUser.uid));
  if (!profileSnapshot.exists()) {
    throw new Error('Akun belum terdaftar di sistem. Hubungi administrator.');
  }

  const profile = profileSnapshot.data();
  const roleId = typeof profile.roleId === 'string' ? profile.roleId : '';
  if (profile.aktif !== true || !getRoleById(roleId) ||
      typeof profile.email !== 'string' || profile.email.toLowerCase() !== firebaseUser.email.toLowerCase()) {
    throw new Error('Akun tidak aktif atau profil akses tidak valid. Hubungi administrator.');
  }

  if (issueServerSession) {
    const tokenResult = await firebaseUser.getIdTokenResult();
    const firebaseClaims = tokenResult.claims.firebase as { sign_in_second_factor?: string } | undefined;
    if (!firebaseClaims?.sign_in_second_factor) {
      throw new Error('Verifikasi MFA belum selesai. Pastikan MFA TOTP diwajibkan di Firebase lalu login kembali.');
    }
    const response = await fetch('/api/auth/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: tokenResult.token })
    });
    if (!response.ok) {
      throw new Error('Server menolak sesi autentikasi. Periksa konfigurasi identitas server.');
    }
  }

  return {
    id: firebaseUser.uid,
    username: typeof profile.username === 'string' ? profile.username : firebaseUser.email.split('@')[0],
    nama: typeof profile.nama === 'string' ? profile.nama : firebaseUser.displayName || 'Staf Klinik',
    email: firebaseUser.email,
    photoURL: firebaseUser.photoURL || undefined,
    roleId,
    aktif: true,
    dibuatPada: typeof profile.dibuatPada === 'string' ? profile.dibuatPada : ''
  };
}

// Hapus salinan data pasien di browser agar tidak terbaca pengguna berikutnya di komputer yang sama.
function clearPatientCache() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (/^(hospital_|simrs_|klinik_|bpjs_|db_|myitaru_igd_)/.test(key) && key !== 'simrs_theme') localStorage.removeItem(key);
    }
  } catch { /* storage tidak tersedia */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [mfaFlow, setMfaFlow] = useState<MfaFlow | null>(null);
  const pendingMfaResolver = useRef<MultiFactorResolver | null>(null);
  const pendingTotpSecret = useRef<TotpSecret | null>(null);
  const suppressAuthRestore = useRef(false);

  const beginMfaEnrollment = async (user: FirebaseUser) => {
    const session = await multiFactor(user).getSession();
    const secret = await TotpMultiFactorGenerator.generateSecret(session);
    pendingTotpSecret.current = secret;
    setMfaFlow({
      type: 'enrollment',
      qrCodeUrl: secret.generateQrCodeUrl(user.email || user.uid, 'MYITARU SIMK'),
      secretKey: secret.secretKey
    });
  };

  const clearMfaFlow = () => {
    pendingMfaResolver.current = null;
    pendingTotpSecret.current = null;
    setMfaFlow(null);
  };

  // Initialize Firebase Auth persistence in IndexedDB
  useEffect(() => {
    if (isFirebaseConfigured) {
      setPersistence(auth, browserLocalPersistence).catch((err) => {
        console.warn('Firebase Auth persistence setup notice:', err);
      });
    }
  }, []);

  // Sesi habis di tengah kerja: satu titik untuk semua fetch('/api/...') di 100+ komponen.
  useEffect(() => {
    if (!isLocalAuthMode) return;
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const response = await originalFetch(...args);
      const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof URL ? args[0].href : args[0].url;
      const path = new URL(url, window.location.origin);
      if (response.status === 401 && path.origin === window.location.origin &&
          path.pathname.startsWith('/api/') && !/^\/api\/(auth|gateway|patient|public)\//.test(path.pathname)) {
        void stopModuleSync(false); // harus sebelum hapus cache: penghapusan lokal tidak boleh ikut terkirim ke server
        clearPatientCache();
        setCurrentUser(null);
      }
      return response;
    };
    return () => { window.fetch = originalFetch; };
  }, []);

  useEffect(() => {
    if (!isLocalAuthMode) return;

    let isMounted = true;
    const controller = new AbortController();
    // Cold start Worker bisa >1 detik; batas pendek membuat sesi valid dianggap logout.
    const timeoutId = window.setTimeout(() => controller.abort(), 15000);

    const restoreLocalSession = async () => {
      try {
        const response = await fetch('/api/auth/me', {
          credentials: 'same-origin',
          signal: controller.signal
        });
        if (response.status === 401) {
          if (isMounted) setCurrentUser(null);
          return;
        }
        if (!response.ok) {
          console.error(`Local session check failed with HTTP ${response.status}.`);
          return;
        }

        const payload: unknown = await response.json();
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
          throw new Error('Local session response is malformed.');
        }
        const user = parseLocalUser((payload as Record<string, unknown>).user);
        if (!user) throw new Error('Local session returned an invalid staff profile.');
        if (isMounted) setCurrentUser(user);
      } catch (error) {
        if (!(error instanceof Error && error.name === 'AbortError')) {
          console.error('Could not restore the local staff session:', error);
        }
      } finally {
        window.clearTimeout(timeoutId);
        if (isMounted) setLoading(false);
      }
    };

    void restoreLocalSession();
    return () => {
      isMounted = false;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, []);

  // Sync users list from Cloud Firestore only when authenticated as Super Admin / Admin
  useEffect(() => {
    const isAdminSession =
      currentUser?.roleId === 'super_admin' ||
      currentUser?.roleId === 'admin';

    if (!isFirebaseConfigured || !db || !firebaseUser || !isAdminSession) {
      return;
    }

    const unsubscribe = onSnapshot(collection(db, 'users'), (snapshot) => {
      const loadedUsers: User[] = [];
      snapshot.forEach((docSnap) => {
        const d = docSnap.data();
        loadedUsers.push({
          id: docSnap.id,
          username: d.username || docSnap.id,
          nama: d.nama || 'Staff Klinik',
          roleId: d.roleId || 'viewer',
          email: d.email || '',
          photoURL: d.photoURL,
          aktif: d.aktif === true,
          dibuatPada: d.dibuatPada || '',
          isGoogleAuth: d.isGoogleAuth ?? false
        });
      });
      setUsers(loadedUsers);
    }, (error) => {
      console.warn('Firestore users collection snapshot notice:', error.message);
    });

    return () => unsubscribe();
  }, [firebaseUser, currentUser?.roleId]);

  // Restore access only from Firebase and a server-issued session cookie.
  useEffect(() => {
    if (isLocalAuthMode) return;
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }

    let isMounted = true;

    const unsubscribe = onAuthStateChanged(auth, async (fUser) => {
      setFirebaseUser(fUser);
      if (suppressAuthRestore.current) {
        if (isMounted) setLoading(false);
        return;
      }
      if (fUser) {
        try {
          await loadAuthorizedProfile(fUser, false);
          if (multiFactor(fUser).enrolledFactors.length === 0) {
            await beginMfaEnrollment(fUser);
            if (isMounted) setCurrentUser(null);
          } else {
            const resolvedProfile = await loadAuthorizedProfile(fUser);
            if (isMounted) setCurrentUser(resolvedProfile);
          }
        } catch (error) {
          console.error('Firebase session validation failed:', error);
          if (isMounted) {
            setCurrentUser(null);
          }
          await fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' }).catch((cleanupError) => {
            console.error('Failed to clear rejected server session:', cleanupError);
          });
          try {
            await firebaseSignOut(auth);
          } catch (signOutError) {
            console.error('Failed to clear rejected Firebase identity:', signOutError);
          }
        }
      } else {
        if (isMounted) {
          setCurrentUser(null);
        }
      }

      if (isMounted) {
        setLoading(false);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // Google Sign-In with Firebase Auth persistence
  const signInWithGoogle = async (): Promise<{ success: boolean; message: string; isCancelled?: boolean }> => {
    if (isLocalAuthMode) {
      window.location.assign('/api/auth/google');
      return { success: false, isCancelled: true, message: 'Mengalihkan ke Google...' };
    }
    if (!isFirebaseConfigured) {
      return { success: false, message: 'Firebase belum dikonfigurasi. Silakan tambahkan konfigurasi Firebase Anda.' };
    }
    try {
      if (isFirebaseConfigured) await setPersistence(auth, browserLocalPersistence);
      const result = await signInWithPopup(auth, googleProvider);
      const fUser = result.user;
      
      const loggedUser = await loadAuthorizedProfile(fUser);
      setCurrentUser(loggedUser);
      setFirebaseUser(fUser);

      logAuthAttempt({
        action: 'GOOGLE_SIGN_IN',
        status: 'SUCCESS',
        email: loggedUser.email,
        nama: loggedUser.nama,
        roleId: loggedUser.roleId,
        authProvider: 'google.com',
        message: 'Google Sign-in popup token successfully verified by Firebase Auth.'
      });

      return { success: true, message: `Selamat datang, ${loggedUser.nama}!` };
    } catch (error: any) {
      logAuthAttempt({
        action: 'GOOGLE_SIGN_IN',
        status: error?.code?.includes('cancelled') || error?.code?.includes('closed') ? 'WARNING' : 'FAILED',
        email: 'unauthenticated',
        authProvider: 'google.com',
        errorCode: error?.code,
        message: error?.message || 'Login dengan Google dibatalkan atau gagal.'
      });

      if (error?.code === 'auth/popup-closed-by-user' || error?.code === 'auth/cancelled-popup-request') {
        return { success: false, isCancelled: true, message: 'Login dengan Google dibatalkan.' };
      }
      if (error?.code === 'auth/popup-blocked') {
        return { success: false, message: 'Jendela popup login diblokir peramban. Mohon izinkan popup di peramban Anda.' };
      }
      if (error?.code === 'auth/network-request-failed') {
        return { success: false, message: 'Koneksi jaringan terputus. Silakan coba kembali.' };
      }
      if (error?.code === 'auth/unauthorized-domain') {
        return { success: false, message: 'Domain ini belum diizinkan di Firebase Console OAuth.' };
      }
      console.warn('Firebase Google Sign-In notice:', error?.message || error);
      return { success: false, message: error.message || 'Gagal masuk dengan Google' };
    }
  };

  // The selected server mode is authoritative; local credentials are never validated in the browser.
  const login = async (usernameOrEmail: string, password: string): Promise<{ success: boolean; message: string; mfaFlow?: 'enrollment' | 'challenge' }> => {
    if (isLocalAuthMode) {
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: usernameOrEmail, password })
        });
        const payload: unknown = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload && typeof payload === 'object' && !Array.isArray(payload) &&
            typeof (payload as Record<string, unknown>).message === 'string'
            ? (payload as Record<string, unknown>).message as string
            : response.status === 429
              ? 'Terlalu banyak percobaan login. Tunggu 1 menit lalu coba lagi.'
              : response.status >= 500
                ? 'Server sedang memulai atau bermasalah. Coba lagi beberapa detik lagi.'
                : 'Username/email atau kata sandi tidak valid.';
          return { success: false, message };
        }
        if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
            (payload as Record<string, unknown>).authMode !== 'local') {
          return { success: false, message: 'Respons autentikasi lokal tidak valid.' };
        }
        const user = parseLocalUser((payload as Record<string, unknown>).user);
        if (!user) return { success: false, message: 'Profil staf lokal dari server tidak valid.' };

        setCurrentUser(user);
        return {
          success: true,
          message: `Selamat datang, ${user.nama} (${getRoleById(user.roleId)?.nama || 'Staf'}).`
        };
      } catch (error) {
        console.error('Local staff login request failed:', error);
        return { success: false, message: 'Server autentikasi lokal tidak dapat dijangkau. Periksa koneksi intranet.' };
      }
    }

    if (!isFirebaseConfigured) {
      return { success: false, message: 'Firebase Authentication belum dikonfigurasi.' };
    }
    const email = usernameOrEmail.trim().toLowerCase();
    if (!email.includes('@')) {
      return { success: false, message: 'Gunakan alamat email pegawai, bukan username demo.' };
    }
    suppressAuthRestore.current = true;
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      await loadAuthorizedProfile(credential.user, false);
      if (multiFactor(credential.user).enrolledFactors.length === 0) {
        setFirebaseUser(credential.user);
        await beginMfaEnrollment(credential.user);
        return {
          success: false,
          mfaFlow: 'enrollment',
          message: 'Daftarkan aplikasi autentikator sebelum menggunakan aplikasi inti.'
        };
      }
      const loggedUser = await loadAuthorizedProfile(credential.user);
      setFirebaseUser(credential.user);
      setCurrentUser(loggedUser);
      suppressAuthRestore.current = false;
      clearMfaFlow();
      logAuthAttempt({
        action: 'STAFF_LOGIN',
        status: 'SUCCESS',
        email: loggedUser.email,
        nama: loggedUser.nama,
        roleId: loggedUser.roleId,
        authProvider: 'password',
        message: 'Firebase identity and server session validated.'
      });
      return { success: true, message: `Selamat datang, ${loggedUser.nama} (${getRoleById(loggedUser.roleId)?.nama || 'Staf'})` };
    } catch (error: any) {
      if (error?.code === 'auth/multi-factor-auth-required') {
        try {
          const resolver = getMultiFactorResolver(auth, error as MultiFactorError);
          if (!resolver.hints.some((hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID)) {
            suppressAuthRestore.current = false;
            return { success: false, message: 'Akun ini menggunakan faktor MFA yang belum didukung oleh layar login. Hubungi administrator.' };
          }
          pendingMfaResolver.current = resolver;
          setMfaFlow({ type: 'challenge' });
          logAuthAttempt({
            action: 'STAFF_LOGIN',
            status: 'WARNING',
            email,
            authProvider: 'password',
            errorCode: error.code,
            message: 'Firebase meminta verifikasi faktor kedua TOTP.'
          });
          return {
            success: false,
            mfaFlow: 'challenge',
            message: 'Masukkan kode dari aplikasi autentikator untuk menyelesaikan login.'
          };
        } catch (resolverError) {
          suppressAuthRestore.current = false;
          return { success: false, message: 'Tantangan MFA tidak dapat diproses. Silakan coba login kembali.' };
        }
      }
      suppressAuthRestore.current = false;
      logAuthAttempt({
        action: 'STAFF_LOGIN',
        status: 'FAILED',
        email,
        authProvider: 'password',
        errorCode: error?.code,
        message: error?.message || 'Autentikasi gagal.'
      });
      await firebaseSignOut(auth);
      return { success: false, message: error?.message || 'Autentikasi gagal.' };
    }
  };

  const requestPasswordReset = async (input: string): Promise<{ success: boolean; message: string }> => {
    if (isLocalAuthMode) {
      return { success: false, message: 'Reset sandi lokal dilakukan oleh administrator sistem.' };
    }
    if (!isFirebaseConfigured) {
      return { success: false, message: 'Firebase Authentication belum dikonfigurasi.' };
    }
    const email = input.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { success: false, message: 'Masukkan alamat email pegawai yang valid.' };
    }

    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error: any) {
      if (error?.code === 'auth/user-not-found' || error?.code === 'auth/invalid-email') {
        return {
          success: true,
          message: 'Jika akun tersedia, instruksi pengaturan ulang akan dikirim ke email tersebut.'
        };
      }
      if (error?.code === 'auth/network-request-failed') {
        return { success: false, message: 'Koneksi jaringan terputus. Silakan coba kembali.' };
      }
      if (error?.code === 'auth/too-many-requests') {
        return { success: false, message: 'Terlalu banyak permintaan. Silakan coba lagi nanti.' };
      }
      if (error?.code === 'auth/unauthorized-domain') {
        return { success: false, message: 'Domain ini belum diizinkan di Firebase Authentication.' };
      }
      console.error('Firebase password reset failed:', error?.code || error);
      return { success: false, message: 'Permintaan reset sandi gagal. Periksa konfigurasi Firebase dan coba lagi.' };
    }

    return {
      success: true,
      message: 'Jika akun tersedia, instruksi pengaturan ulang akan dikirim ke email tersebut.'
    };
  };

  const completeMfa = async (code: string): Promise<{ success: boolean; message: string }> => {
    const resolver = pendingMfaResolver.current;
    const factor = resolver?.hints.find((hint) => hint.factorId === TotpMultiFactorGenerator.FACTOR_ID);
    if (!resolver || !factor) {
      return { success: false, message: 'Tantangan MFA sudah tidak berlaku. Silakan login kembali.' };
    }
    if (!/^\d{6}$/.test(code)) {
      return { success: false, message: 'Masukkan kode autentikator 6 digit.' };
    }
    try {
      const credential = await resolver.resolveSignIn(
        TotpMultiFactorGenerator.assertionForSignIn(factor.uid, code)
      );
      const loggedUser = await loadAuthorizedProfile(credential.user);
      setFirebaseUser(credential.user);
      setCurrentUser(loggedUser);
      suppressAuthRestore.current = false;
      clearMfaFlow();
      return { success: true, message: `Selamat datang, ${loggedUser.nama}!` };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Verifikasi MFA gagal.' };
    }
  };

  const completeMfaEnrollment = async (code: string): Promise<{ success: boolean; message: string; reauthenticationRequired?: boolean }> => {
    const user = auth?.currentUser;
    const secret = pendingTotpSecret.current;
    if (!user || !secret) {
      return { success: false, message: 'Pendaftaran MFA sudah tidak berlaku. Silakan login kembali.' };
    }
    if (!/^\d{6}$/.test(code)) {
      return { success: false, message: 'Masukkan kode autentikator 6 digit.' };
    }
    try {
      if (!multiFactor(user).enrolledFactors.some((factor) => factor.factorId === TotpMultiFactorGenerator.FACTOR_ID)) {
        await multiFactor(user).enroll(
          TotpMultiFactorGenerator.assertionForEnrollment(secret, code),
          'MYITARU SIMK authenticator'
        );
      }
      const response = await fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' });
      if (!response.ok) throw new Error('Faktor MFA tersimpan, tetapi sesi lama gagal dibersihkan. Keluar lalu login kembali.');
      await firebaseSignOut(auth);
      suppressAuthRestore.current = false;
      clearMfaFlow();
      setCurrentUser(null);
      setFirebaseUser(null);
      return {
        success: false,
        reauthenticationRequired: true,
        message: 'MFA berhasil didaftarkan. Login kembali dan masukkan kode TOTP untuk membuktikan faktor kedua.'
      };
    } catch (error: any) {
      return { success: false, message: error?.message || 'Pendaftaran MFA gagal.' };
    }
  };

  const cancelMfa = async () => {
    const response = await fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Sesi server tidak dapat dibersihkan. Silakan coba kembali.');
    await firebaseSignOut(auth);
    suppressAuthRestore.current = false;
    clearMfaFlow();
    setCurrentUser(null);
    setFirebaseUser(null);
  };

  // Revoke the server session before clearing the Firebase client session.
  const logout = async () => {
    // Kirim perubahan modul yang tertunda, lalu hentikan sinkron sebelum cache lokal dihapus.
    await stopModuleSync(true);
    clearPatientCache();
    if (currentUser) {
      logAuthAttempt({
        action: 'LOGOUT',
        status: 'SUCCESS',
        email: currentUser.email,
        nama: currentUser.nama,
        roleId: currentUser.roleId,
        message: 'Pengguna keluar dari sesi aplikasi.'
      });
    }

    if (isLocalAuthMode) {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error('Sesi lokal tidak dapat diakhiri. Silakan coba kembali.');
      setCurrentUser(null);
      setFirebaseUser(null);
      return;
    }

    const response = await fetch('/api/auth/session', { method: 'DELETE', credentials: 'same-origin' });
    if (!response.ok) throw new Error('Sesi server tidak dapat diakhiri. Silakan coba kembali.');
    if (isFirebaseConfigured) await firebaseSignOut(auth);
    setCurrentUser(null);
    setFirebaseUser(null);
  };

  const hasAccess = (moduleId: string): boolean => {
    if (!currentUser) return false;
    return hasModuleAccess(currentUser.roleId, moduleId);
  };

  const addUser = async (userData: Omit<User, 'id' | 'dibuatPada'>) => {
    const newId = 'u_' + Date.now().toString();
    const newUser: User = {
      ...userData,
      id: newId,
      dibuatPada: new Date().toISOString().split('T')[0]
    };
    setUsers(prev => [...prev, newUser]);

    try {
      if (isFirebaseConfigured && db && auth?.currentUser) {
        const { password: _pw, ...safeUser } = newUser;
        await setDoc(doc(db, 'users', newId), {
          ...safeUser,
          uid: newId,
          updatedAt: new Date().toISOString()
        });
      }
    } catch (err) {
      console.warn('Could not sync user to Firestore:', err);
    }
  };

  const updateUser = async (id: string, data: Partial<User>) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, ...data } : u));
    if (currentUser && (currentUser.id === id || currentUser.username === data.username)) {
      const updated = { ...currentUser, ...data };
      setCurrentUser(updated);
    }

    try {
      if (isFirebaseConfigured && db && auth?.currentUser) {
        const { password: _pw, ...safeUpdates } = data;
        await setDoc(doc(db, 'users', id), {
          ...safeUpdates,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }
    } catch (err) {
      console.warn('Could not sync user update to Firestore:', err);
    }
  };

  const deleteUser = async (id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
    try {
      if (isFirebaseConfigured && db && auth?.currentUser) {
        await deleteDoc(doc(db, 'users', id));
      }
    } catch (err) {
      console.warn('Could not delete user from Firestore:', err);
    }
  };

  const isAdmin = currentUser?.roleId === 'super_admin' || currentUser?.roleId === 'admin';
  const isReadOnly = currentUser?.roleId === 'viewer';

  useEffect(() => {
    if (isReadOnly) {
      document.body.classList.add('viewer-mode');
    } else {
      document.body.classList.remove('viewer-mode');
    }
  }, [isReadOnly]);

  return (
    <AuthContext.Provider value={{
      currentUser,
      firebaseUser,
      users,
      loading,
      isReadOnly,
      login,
      requestPasswordReset,
      mfaFlow,
      completeMfa,
      completeMfaEnrollment,
      cancelMfa,
      signInWithGoogle,
      logout,
      hasAccess,
      isAdmin,
      addUser,
      updateUser,
      deleteUser
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth harus digunakan di dalam AuthProvider');
  }
  return context;
}
