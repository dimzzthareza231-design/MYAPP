import React, { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { onIdTokenChanged, signInWithEmailAndPassword, signInWithPopup, signOut, setPersistence, browserSessionPersistence, type User as FirebaseUser } from 'firebase/auth';
import { collection, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider, isFirebaseConfigured } from '../lib/firebase';
import { hasModuleAccess } from '../data/roles';
import { clearAuthSession } from '../utils/sessionStore';
import { resetSessionStorage } from '../utils/storage';

export interface User { id: string; username: string; password?: string; nama: string; roleId: string; email: string; photoURL?: string; aktif: boolean; dibuatPada: string; isGoogleAuth?: boolean; }
interface Result { success: boolean; message: string; isCancelled?: boolean; }
interface AuthContextType {
  currentUser: User | null; firebaseUser: FirebaseUser | null; users: User[]; loading: boolean; isReadOnly: boolean; isAdmin: boolean;
  login: (email: string, password: string) => Promise<Result>;
  signInWithGoogle: () => Promise<Result>; logout: () => Promise<void>; hasAccess: (moduleId: string) => boolean;
  addUser: (user: Omit<User, 'id' | 'dibuatPada'>) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>; deleteUser: (id: string) => Promise<void>;
}
const Context = createContext<AuthContextType | undefined>(undefined);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const generation = useRef(0);
  const isAdmin = !!currentUser && ['admin', 'super_admin'].includes(currentUser.roleId);
  async function profile(user: FirebaseUser): Promise<User> {
    if (!user.emailVerified) throw new Error('Verifikasi email Anda terlebih dahulu.');
    const response = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.user?.aktif) throw new Error(data.error || 'Akun belum diaktifkan administrator.');
    return data.user;
  }
  useEffect(() => {
    // Legacy IndexedDB user objects are not authentication credentials.
    void clearAuthSession().catch(() => {});
    if (!isFirebaseConfigured) { setLoading(false); return; }
    void setPersistence(auth, browserSessionPersistence).catch(() => {});
    return onIdTokenChanged(auth, async (user) => {
      const run = ++generation.current;
      setCurrentUser(null); setFirebaseUser(user); setLoading(true); resetSessionStorage();
      try {
        if (user) { const resolved = await profile(user); if (run === generation.current) setCurrentUser(resolved); }
      } catch { if (run === generation.current) setCurrentUser(null); }
      finally { if (run === generation.current) setLoading(false); }
    });
  }, []);
  useEffect(() => {
    if (!isAdmin || !db || !firebaseUser) { setUsers([]); return; }
    return onSnapshot(collection(db, 'users'), snapshot => {
      setUsers(snapshot.docs.map(item => ({ ...item.data(), id: item.id, password: undefined } as User)));
    }, () => setUsers([]));
  }, [isAdmin, firebaseUser?.uid]);
  const authenticate = async (operation: () => Promise<{ user: FirebaseUser }>): Promise<Result> => {
    if (!isFirebaseConfigured) return { success: false, message: 'Firebase belum dikonfigurasi.' };
    try {
      const result = await operation();
      const resolved = await profile(result.user);
      setCurrentUser(resolved); setFirebaseUser(result.user);
      return { success: true, message: `Selamat datang, ${resolved.nama}.` };
    } catch (error: any) {
      await signOut(auth).catch(() => {}); setCurrentUser(null);
      const cancelled = ['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error?.code);
      const safeMessage = error?.code ? 'Login gagal. Periksa kredensial, verifikasi email, dan aktivasi akun.' : error?.message || 'Login gagal.';
      return { success: false, isCancelled: cancelled, message: cancelled ? 'Login dibatalkan.' : safeMessage };
    }
  };
  const login = (email: string, password: string) => {
    if (!email.includes('@') || !password) return Promise.resolve({ success: false, message: 'Gunakan email akun Firebase dan kata sandi, bukan akun demo.' });
    return authenticate(() => signInWithEmailAndPassword(auth, email.trim(), password));
  };
  const signInWithGoogle = () => authenticate(() => signInWithPopup(auth, googleProvider));
  const logout = async () => {
    ++generation.current; setCurrentUser(null); setFirebaseUser(null); setUsers([]); resetSessionStorage();
    if (isFirebaseConfigured) await signOut(auth);
    await clearAuthSession().catch(() => {});
  };
  const updateUser = async (id: string, data: Partial<User>) => {
    if (!isAdmin || !db) throw new Error('Akses administrator diperlukan.');
    const allowed = ['nama', 'username', 'roleId', 'aktif', 'photoURL'] as const;
    const safe = Object.fromEntries(allowed.filter(key => data[key] !== undefined).map(key => [key, data[key]]));
    await updateDoc(doc(db, 'users', id), { ...safe, updatedAt: new Date().toISOString() });
  };
  const addUser = async () => { throw new Error('Buat akun di Firebase Authentication lalu provision users/{uid}; password tidak disimpan di browser atau Firestore.'); };
  const deleteUser = async (id: string) => { await updateUser(id, { aktif: false }); };
  return <Context.Provider value={{ currentUser, firebaseUser, users, loading, isAdmin, isReadOnly: !currentUser || ['viewer', 'patient'].includes(currentUser.roleId), login, signInWithGoogle, logout, hasAccess: id => !!currentUser?.aktif && hasModuleAccess(currentUser.roleId, id), addUser, updateUser, deleteUser }}>{children}</Context.Provider>;
}
export function useAuth() { const value = useContext(Context); if (!value) throw new Error('AuthProvider diperlukan.'); return value; }
