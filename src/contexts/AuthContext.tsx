import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { logAuthAttempt } from '../lib/activityLogger';
import { startModuleSync, stopModuleSync } from '../lib/moduleSync';
import { hasModuleAccess, getRoleById } from '../data/roles';
import { type FacilityMode, isModuleAllowedInFacilityMode } from '../data/moduleRegistry';

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
  mustChangePassword?: boolean;
}

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  loading: boolean;
  isReadOnly: boolean;
  login: (usernameOrEmail: string, password: string) => Promise<{ success: boolean; message: string; mfaFlow?: 'enrollment' | 'challenge' }>;
  requestPasswordReset: (email: string) => Promise<{ success: boolean; message: string }>;
  mfaFlow: MfaFlow | null;
  completeMfa: (code: string) => Promise<{ success: boolean; message: string }>;
  completeMfaEnrollment: (code: string) => Promise<{ success: boolean; message: string; reauthenticationRequired?: boolean }>;
  cancelMfa: () => Promise<void>;
  logout: () => Promise<void>;
  hasAccess: (moduleId: string) => boolean;
  facilityMode: FacilityMode;
  setFacilityMode: (mode: FacilityMode) => void;
  isAdmin: boolean;
  // User management
  addUser: (user: Omit<User, 'id' | 'dibuatPada' | 'password'> & { password: string }) => Promise<void>;
  updateUser: (id: string, data: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
}

const FACILITY_MODE_STORAGE_KEY = 'myitaru_facility_mode';

function readInitialFacilityMode(): FacilityMode {
  try {
    const saved = localStorage.getItem(FACILITY_MODE_STORAGE_KEY);
    return saved === 'rumah_sakit' ? 'rumah_sakit' : 'klinik';
  } catch {
    return 'klinik';
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

type MfaFlow =
  | { type: 'enrollment'; qrCodeUrl: string; secretKey: string; challengeToken?: string; userId?: string; local?: boolean }
  | { type: 'challenge'; challengeToken?: string; userId?: string; local?: boolean };

function parseLocalUser(value: unknown): User | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id !== 'string' || typeof record.username !== 'string' ||
      typeof record.nama !== 'string' || typeof record.email !== 'string' ||
      typeof record.roleId !== 'string' || typeof record.aktif !== 'boolean') {
    return null;
  }
  if (!getRoleById(record.roleId)) return null;
  return {
    id: record.id,
    username: record.username,
    nama: record.nama,
    email: record.email,
    roleId: record.roleId,
    aktif: record.aktif,
    dibuatPada: typeof record.dibuatPada === 'string' ? record.dibuatPada : '',
    ...(typeof record.mustChangePassword === 'boolean' ? { mustChangePassword: record.mustChangePassword } : {})
  };
}

async function readLocalAuthResponse(response: Response): Promise<Record<string, unknown>> {
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload && typeof payload === 'object' && !Array.isArray(payload) &&
      typeof (payload as Record<string, unknown>).message === 'string'
      ? (payload as Record<string, unknown>).message as string
      : `Permintaan manajemen pengguna gagal (HTTP ${response.status}).`;
    throw new Error(message);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) ||
      (payload as Record<string, unknown>).success !== true) {
    throw new Error('Respons manajemen pengguna lokal tidak valid.');
  }
  return payload as Record<string, unknown>;
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
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [facilityMode, setFacilityModeState] = useState<FacilityMode>(readInitialFacilityMode);
  const [mfaFlow, setMfaFlow] = useState<MfaFlow | null>(null);

  const setFacilityMode = useCallback((mode: FacilityMode) => {
    setFacilityModeState(mode);
    try {
      localStorage.setItem(FACILITY_MODE_STORAGE_KEY, mode);
    } catch { /* storage tidak tersedia */ }
  }, []);
  const clearMfaFlow = () => {
    setMfaFlow(null);
  };

  // Sesi habis di tengah kerja: satu titik untuk semua fetch('/api/...') di 100+ komponen.
  useEffect(() => {
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
    if (import.meta.env.VITE_APP_TARGET === 'public') {
      setLoading(false);
      return;
    }

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

  // Module data (localStorage keys) syncs to /api/v1/system-data while a staff session is active.
  useEffect(() => {
    if (currentUser?.id) void startModuleSync();
  }, [currentUser?.id]);

  useEffect(() => {
    if (!['super_admin', 'admin'].includes(currentUser?.roleId || '')) {
      setUsers([]);
      return;
    }

    let isMounted = true;
    const controller = new AbortController();
    const loadLocalUsers = async () => {
      try {
        const response = await fetch('/api/v1/auth/users', {
          credentials: 'same-origin',
          signal: controller.signal
        });
        const payload = await readLocalAuthResponse(response);
        const records = payload.users;
        if (!Array.isArray(records)) throw new Error('Daftar pengguna lokal tidak valid.');
        const loadedUsers = records.map(parseLocalUser);
        if (loadedUsers.some((user) => !user)) throw new Error('Server mengirim profil pengguna lokal yang tidak valid.');
        if (isMounted) setUsers(loadedUsers.filter((user): user is User => user !== null));
      } catch (error) {
        if (isMounted && !(error instanceof Error && error.name === 'AbortError')) {
          console.error('Could not load local staff users:', error);
        }
      }
    };
    void loadLocalUsers();
    return () => {
      isMounted = false;
      controller.abort();
    };
  }, [currentUser?.roleId]);

  // The server session is the only staff login path; credentials are never validated in the browser.
  const login = async (usernameOrEmail: string, password: string): Promise<{ success: boolean; message: string; mfaFlow?: 'enrollment' | 'challenge' }> => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: usernameOrEmail, password })
      });
      const payload: unknown = await response.json().catch(() => null);
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        const record = payload as Record<string, unknown>;
        if (record.authMode === 'local' && (record.mfaFlow === 'enrollment' || record.mfaFlow === 'challenge')) {
          const user = parseLocalUser(record.user);
          if (typeof record.challengeToken !== 'string' || !user) {
            return { success: false, message: 'Tantangan MFA lokal dari server tidak valid.' };
          }
          if (record.mfaFlow === 'enrollment') {
            if (typeof record.qrCodeUrl !== 'string' || typeof record.secretKey !== 'string') {
              return { success: false, message: 'Data pendaftaran MFA dari server tidak lengkap.' };
            }
            setMfaFlow({
              type: 'enrollment',
              qrCodeUrl: record.qrCodeUrl,
              secretKey: record.secretKey,
              challengeToken: record.challengeToken,
              userId: user.id,
              local: true
            });
          } else {
            setMfaFlow({ type: 'challenge', challengeToken: record.challengeToken, userId: user.id, local: true });
          }
          return {
            success: false,
            mfaFlow: record.mfaFlow,
            message: record.mfaFlow === 'enrollment'
              ? 'Daftarkan aplikasi autentikator TOTP sebelum masuk.'
              : 'Masukkan kode dari aplikasi autentikator TOTP.'
          };
        }
      }
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
  };

  const requestPasswordReset = async (_input: string): Promise<{ success: boolean; message: string }> => {
    return { success: false, message: 'Reset sandi lokal dilakukan oleh administrator sistem.' };
  };

  const completeLocalMfa = async (code: string): Promise<{ success: boolean; message: string }> => {
    const challengeToken = mfaFlow?.local ? mfaFlow.challengeToken : undefined;
    const userId = mfaFlow?.local ? mfaFlow.userId : undefined;
    if (!challengeToken || !userId) return { success: false, message: 'Tantangan MFA lokal sudah tidak berlaku. Silakan login kembali.' };
    try {
      const response = await fetch('/api/auth/mfa/complete', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken, userId, code })
      });
      const payload: unknown = await response.json().catch(() => null);
      if (!response.ok || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
        const message = payload && typeof payload === 'object' && typeof (payload as Record<string, unknown>).message === 'string'
          ? (payload as Record<string, unknown>).message as string
          : 'Verifikasi MFA lokal gagal.';
        return { success: false, message };
      }
      const record = payload as Record<string, unknown>;
      const user = parseLocalUser(record.user);
      if (record.success !== true || record.authMode !== 'local' || !user) {
        return { success: false, message: 'Respons verifikasi MFA lokal tidak valid.' };
      }
      setCurrentUser(user);
      clearMfaFlow();
      return { success: true, message: `Selamat datang, ${user.nama} (${getRoleById(user.roleId)?.nama || 'Staf'}).` };
    } catch {
      return { success: false, message: 'Server autentikasi lokal tidak dapat dijangkau.' };
    }
  };

  const completeMfa = async (code: string): Promise<{ success: boolean; message: string }> => completeLocalMfa(code);

  const completeMfaEnrollment = async (code: string): Promise<{ success: boolean; message: string; reauthenticationRequired?: boolean }> =>
    completeLocalMfa(code);

  const cancelMfa = async () => {
    if (mfaFlow?.local && mfaFlow.challengeToken) {
      const response = await fetch('/api/auth/mfa/cancel', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeToken: mfaFlow.challengeToken })
      });
      if (!response.ok) throw new Error('Tantangan MFA lokal tidak dapat dibersihkan. Silakan coba kembali.');
    }
    clearMfaFlow();
  };

  // Revoke the server session, then drop local state.
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

    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!response.ok) throw new Error('Sesi lokal tidak dapat diakhiri. Silakan coba kembali.');
    setCurrentUser(null);
  };

  const hasAccess = useCallback((moduleId: string): boolean => {
    if (!currentUser) return false;
    if (!isModuleAllowedInFacilityMode(moduleId, facilityMode)) return false;
    return hasModuleAccess(currentUser.roleId, moduleId);
  }, [currentUser, facilityMode]);

  const addUser = async (userData: Omit<User, 'id' | 'dibuatPada' | 'password'> & { password: string }) => {
    const response = await fetch('/api/v1/auth/users', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
    const payload = await readLocalAuthResponse(response);
    const user = parseLocalUser(payload.user);
    if (!user) throw new Error('Server mengirim profil pengguna baru yang tidak valid.');
    setUsers((previous) => [...previous, user]);
  };

  const updateUser = async (id: string, data: Partial<User>) => {
    const updates = {
      ...(data.email === undefined ? {} : { email: data.email }),
      ...(data.nama === undefined ? {} : { nama: data.nama }),
      ...(data.roleId === undefined ? {} : { roleId: data.roleId }),
      ...(data.password === undefined ? {} : { password: data.password }),
      ...(data.aktif === undefined ? {} : { aktif: data.aktif })
    };
    const response = await fetch(`/api/v1/auth/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    const payload = await readLocalAuthResponse(response);
    const user = parseLocalUser(payload.user);
    if (!user) throw new Error('Server mengirim profil pengguna yang diperbarui dengan format tidak valid.');
    setUsers((previous) => previous.map((item) => item.id === id ? user : item));
    if (currentUser?.id === id) setCurrentUser(user);
  };

  const deleteUser = async (id: string) => {
    const response = await fetch(`/api/v1/auth/users/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'same-origin'
    });
    await readLocalAuthResponse(response);
    setUsers((previous) => previous.filter((user) => user.id !== id));
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
      users,
      loading,
      isReadOnly,
      login,
      requestPasswordReset,
      mfaFlow,
      completeMfa,
      completeMfaEnrollment,
      cancelMfa,
      logout,
      hasAccess,
      facilityMode,
      setFacilityMode,
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
