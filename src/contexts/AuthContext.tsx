import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signInWithEmailAndPassword, signInWithPopup, signOut, setPersistence, browserSessionPersistence, type User as FirebaseUser } from 'firebase/auth';
import { collection, onSnapshot, updateDoc, doc } from 'firebase/firestore';
import { auth, db, googleProvider, isFirebaseConfigured } from '../lib/firebase';
import { hasModuleAccess } from '../data/roles';

export interface User {
  id: string; username: string; nama: string; roleId: string; email: string;
  photoURL?: string; aktif: boolean; dibuatPada: string; isGoogleAuth?: boolean;
  // Kept only for compatibility with the legacy user-management form.
  // Passwords are never loaded, stored, or validated by this context.
  password?: never;
}
interface Result { success: boolean; message: string; isCancelled?: boolean; }
interface AuthContextType {
  currentUser: User | null; firebaseUser: FirebaseUser | null; users: User[];
  loading: boolean; authError: string; isReadOnly: boolean; isAdmin: boolean;
  login: (email: string, password: string) => Promise<Result>;
  signInWithGoogle: () => Promise<Result>; logout: () => Promise<void>;
  hasAccess: (moduleId: string) => boolean;
  addUser: (user: Omit<User, 'id' | 'dibuatPada'>) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
}
const Context = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState('');
  const sequence = useRef(0);
  const isAdmin = currentUser?.roleId === 'admin' || currentUser?.roleId === 'super_admin';
  async function profile(user: FirebaseUser): Promise<User> {
    if (!user.emailVerified) throw new Error('Verifikasi email Firebase terlebih dahulu.');
    const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.user || data.user.id !== user.uid || data.user.aktif !== true) throw new Error(data.error || 'Hak akses belum disetujui administrator.');
    const resolved = { ...data.user, isGoogleAuth: user.providerData.some(p => p.providerId === 'google.com') } as User;
    if (auth.currentUser?.uid === user.uid) { setCurrentUser(resolved); setFirebaseUser(user); setAuthError(''); }
    return resolved;
  }
  useEffect(() => {
    if (!isFirebaseConfigured) { setAuthError('Firebase belum dikonfigurasi oleh pengelola.'); setLoading(false); return; }
    let mounted = true;
    let unsubscribe = () => {};
    setPersistence(auth, browserSessionPersistence).then(() => {
      if (!mounted) return;
      unsubscribe = onIdTokenChanged(auth, async (user) => {
        const request = ++sequence.current;
        setLoading(true); setCurrentUser(null); setFirebaseUser(user);
        try { if (user) await profile(user); }
        catch (error) { if (mounted && request === sequence.current) { setAuthError(error instanceof Error ? error.message : 'Verifikasi sesi gagal.'); setCurrentUser(null); } }
        finally { if (mounted && request === sequence.current) setLoading(false); }
      });
    }).catch(() => { if (mounted) { setAuthError('Penyimpanan sesi tidak tersedia.'); setLoading(false); } });
    return () => { mounted = false; sequence.current++; unsubscribe(); };
  }, []);
  useEffect(() => {
    if (!isAdmin || !firebaseUser || !db) { setUsers([]); return; }
    return onSnapshot(collection(db, 'users'), (snapshot) => {
      setUsers(snapshot.docs.map(d => { const p = d.data(); return { id: d.id, username: p.username || '', nama: p.nama || '', email: p.email || '', roleId: p.roleId || 'viewer', aktif: p.aktif === true, dibuatPada: p.dibuatPada || '' }; }));
    }, () => setUsers([]));
  }, [isAdmin, firebaseUser?.uid]);
  async function login(email: string, password: string): Promise<Result> {
    if (!isFirebaseConfigured) return { success: false, message: 'Firebase belum dikonfigurasi.' };
    try {
      const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
      await profile(credential.user);
      return { success: true, message: 'Identitas dan hak akses berhasil diverifikasi.' };
    } catch (error) {
      await signOut(auth).catch(() => {}); setCurrentUser(null);
      const message = error instanceof Error && !error.message.startsWith('Firebase:') ? error.message : 'Login gagal. Periksa akun, kata sandi, dan aktivasi akun Anda.';
      setAuthError(message); return { success: false, message };
    }
  }
  async function signInWithGoogle(): Promise<Result> {
    if (!isFirebaseConfigured) return { success: false, message: 'Firebase belum dikonfigurasi.' };
    try {
      const credential = await signInWithPopup(auth, googleProvider);
      await profile(credential.user);
      return { success: true, message: 'Identitas dan hak akses berhasil diverifikasi.' };
    } catch (error: any) {
      await signOut(auth).catch(() => {}); setCurrentUser(null);
      const cancelled = error?.code === 'auth/popup-closed-by-user';
      const message = cancelled ? 'Login dibatalkan.' : error?.message?.startsWith('Firebase:') ? 'Login Google gagal. Periksa domain dan aktivasi akun.' : error?.message || 'Verifikasi akun gagal.';
      setAuthError(message); return { success: false, isCancelled: cancelled, message };
    }
  }
  async function logout() { sequence.current++; if (auth) await signOut(auth); setCurrentUser(null); setFirebaseUser(null); setUsers([]); }
  async function addUser(): Promise<void> { throw new Error('Buat identitas di Firebase Authentication, lalu tetapkan dokumen users/{UID}. Akun lokal tidak didukung.'); }
  async function updateUser(id: string, data: Partial<User>) {
    if (!isAdmin || !auth?.currentUser || !db) throw new Error('Administrator terverifikasi diperlukan.');
    if ('password' in data) throw new Error('Kata sandi hanya dikelola melalui Firebase Authentication.');
    const allowed = ['username', 'nama', 'email', 'photoURL', 'roleId', 'aktif'];
    const safe = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)));
    await updateDoc(doc(db, 'users', id), { ...safe, updatedAt: new Date().toISOString() });
  }
  async function deleteUser(): Promise<void> { throw new Error('Nonaktifkan akun melalui pengelolaan identitas; penghapusan lokal tidak didukung.'); }
  return <Context.Provider value={{ currentUser, firebaseUser, users, loading, authError, isAdmin,
    isReadOnly: !currentUser || ['viewer', 'patient'].includes(currentUser.roleId), login, signInWithGoogle, logout,
    hasAccess: (moduleId) => !!currentUser && currentUser.aktif && hasModuleAccess(currentUser.roleId, moduleId),
    addUser, updateUser, deleteUser }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider diperlukan.'); return value; }
