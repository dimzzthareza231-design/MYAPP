import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FlaskConical,
  KeyRound,
  LogIn,
  Lock,
  Pill,
  Receipt,
  Server,
  ShieldCheck,
  Stethoscope,
  User as UserIcon,
  UserCheck
} from 'lucide-react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../contexts/AuthContext';
import { useHospital } from '../contexts/HospitalContext';
import { isFirebaseConfigured, isLocalAuthMode } from '../lib/firebase';
import { BrandLogo } from './Common/BrandLogo';

const ROLE_CARDS: {
  roleId: string;
  loginIdentifier: string;
  title: string;
  subtitle: string;
  badgeColor: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    roleId: 'admin',
    loginIdentifier: 'admin',
    title: 'Admin / IT SIMK-SIMRS',
    subtitle: 'Pengelolaan konfigurasi, pengguna, dan operasional',
    badgeColor: 'bg-slate-800 text-white',
    icon: ShieldCheck
  },
  {
    roleId: 'dokter',
    loginIdentifier: 'dokter',
    title: 'Dokter / DPJP',
    subtitle: 'CPPT SOAP, e-Resep, dan order pemeriksaan',
    badgeColor: 'bg-blue-600 text-white',
    icon: Stethoscope
  },
  {
    roleId: 'perawat',
    loginIdentifier: 'perawat',
    title: 'Perawat / Triase',
    subtitle: 'Asesmen awal, tanda vital, triase IGD dan poli',
    badgeColor: 'bg-teal-600 text-white',
    icon: UserCheck
  },
  {
    roleId: 'rekam_medis',
    loginIdentifier: 'rmik',
    title: 'Perekam Medis (RMIK)',
    subtitle: 'Registrasi, rekam medis, dan audit dokumentasi',
    badgeColor: 'bg-indigo-600 text-white',
    icon: FileSpreadsheet
  },
  {
    roleId: 'apoteker',
    loginIdentifier: 'apoteker',
    title: 'Apoteker / Farmasi',
    subtitle: 'Verifikasi resep, stok, dan penyerahan obat',
    badgeColor: 'bg-emerald-600 text-white',
    icon: Pill
  },
  {
    roleId: 'laboran',
    loginIdentifier: 'lab',
    title: 'Laboratorium',
    subtitle: 'Order pemeriksaan, spesimen, dan hasil lab',
    badgeColor: 'bg-rose-600 text-white',
    icon: FlaskConical
  },
  {
    roleId: 'kasir',
    loginIdentifier: 'kasir',
    title: 'Kasir & Klaim JKN',
    subtitle: 'Billing pasien, kuitansi, dan verifikasi penjamin',
    badgeColor: 'bg-amber-600 text-white',
    icon: Receipt
  }
];

export function Login({ embedded = false }: { embedded?: boolean }) {
  const {
    login,
    requestPasswordReset,
    signInWithGoogle,
    loading,
    mfaFlow,
    completeMfa,
    completeMfaEnrollment,
    cancelMfa
  } = useAuth();
  const { hospitalSettings } = useHospital();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mfaCode, setMfaCode] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');
  const usernameInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!username.trim() || !password.trim()) {
      toast.error('Email pegawai dan kata sandi wajib diisi');
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(username, password);
      if (result.success) {
        toast.success(result.message);
        setUsername('');
        setPassword('');
      } else if (result.mfaFlow) {
        setPassword('');
        toast(result.message);
      } else {
        setErrorMessage(result.message);
        toast.error(result.message);
      }
    } catch (err: any) {
      const message = err?.message || 'Gagal masuk';
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const g = new URLSearchParams(window.location.search).get('google');
    if (!g) return;
    toast.error(g === 'tidak-terdaftar' ? 'Email Google belum terdaftar sebagai staf.' : 'Login Google gagal atau belum diaktifkan.');
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const handleGoogleSignIn = async () => {
    setErrorMessage('');
    setIsLoading(true);
    try {
      const result = await signInWithGoogle();
      if (result.success) {
        toast.success(result.message);
      } else if (!result.isCancelled) {
        setErrorMessage(result.message);
        toast.error(result.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleMfaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaFlow) return;

    setIsLoading(true);
    try {
      const result = mfaFlow.type === 'enrollment'
        ? await completeMfaEnrollment(mfaCode)
        : await completeMfa(mfaCode);
      if (result.success) {
        toast.success(result.message);
        setMfaCode('');
        setUsername('');
        setPassword('');
      } else if ('reauthenticationRequired' in result && result.reauthenticationRequired) {
        toast(result.message);
        setMfaCode('');
      } else {
        toast.error(result.message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!username.trim()) {
      toast.error('Masukkan email pegawai terlebih dahulu.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await requestPasswordReset(username);
      if (result.success) toast.success(result.message);
      else toast.error(result.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelMfa = async () => {
    setIsLoading(true);
    try {
      await cancelMfa();
      setMfaCode('');
      toast('Login dibatalkan. Silakan mulai kembali.');
    } catch (error: any) {
      toast.error(error?.message || 'Sesi tidak dapat dibersihkan.');
    } finally {
      setIsLoading(false);
    }
  };

  const loginCard = (
    <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 sm:p-8 w-full border border-slate-200 dark:border-slate-800 relative overflow-hidden">
      <div className="h-1.5 w-full bg-gradient-to-r from-[#0B3D91] via-[#C9A94E] to-[#0B3D91] absolute top-0 left-0" />
      {/* Logo & Title */}
      <div className="text-center mb-6 relative pt-1">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/30 text-[#9A7418] dark:text-amber-300 font-mono text-[10px] font-bold tracking-wider uppercase mb-3">
          <Lock className="w-3 h-3" />
          <span>GERBANG KHUSUS: SIMK-INTI</span>
        </div>
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-sm overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <BrandLogo alt="Logo MYITARU" className="w-full h-full object-cover" />
        </div>
        <h2 className="text-xl font-extrabold text-slate-900 dark:text-white leading-tight">
          {hospitalSettings?.name || 'MYITARU'}
        </h2>
        <p className="text-xs font-semibold text-[#0B3D91] dark:text-sky-400 mt-1 flex items-center justify-center gap-1">
          <ShieldCheck className="w-4 h-4" /> MYITARU SIMK · Aplikasi Inti &amp; RME Klinis
        </p>
      </div>

      {errorMessage && !mfaFlow && (
        <div
          role="alert"
          className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

        {mfaFlow ? (
          <div className="space-y-4">
            {mfaFlow.type === 'enrollment' ? (
              <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-4 text-center space-y-3">
                <p className="text-sm font-bold text-slate-800 dark:text-white">Aktifkan verifikasi dua langkah</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">
                  Pindai QR dengan aplikasi autentikator TOTP. Simpan kunci manual dengan aman jika pemindaian tidak tersedia.
                </p>
                <div className="inline-flex rounded-lg bg-white p-3">
                  <QRCodeSVG value={mfaFlow.qrCodeUrl} size={160} />
                </div>
                <div className="text-left">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Kunci manual</label>
                  <code className="block select-all break-all rounded-lg bg-white dark:bg-slate-900 p-2 text-xs text-slate-800 dark:text-slate-200">
                    {mfaFlow.secretKey}
                  </code>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-4 text-center">
                <KeyRound className="w-6 h-6 mx-auto mb-2 text-blue-700 dark:text-blue-300" />
                <p className="text-sm font-bold text-slate-800 dark:text-white">Verifikasi aplikasi autentikator</p>
                <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">Masukkan kode TOTP 6 digit untuk menyelesaikan login.</p>
              </div>
            )}

            <form onSubmit={handleMfaSubmit} className="space-y-3">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                Kode autentikator
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  className="mt-1 w-full p-3 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-center text-lg tracking-[0.4em] focus:ring-2 focus:ring-blue-500 outline-none"
                  placeholder="000000"
                  required
                />
              </label>
              <button
                type="submit"
                disabled={isLoading || loading || mfaCode.length !== 6}
                className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-sm"
              >
                <ShieldCheck className="w-4 h-4" />
                {isLoading ? 'Memverifikasi...' : mfaFlow.type === 'enrollment' ? 'Aktifkan MFA dan Masuk' : 'Verifikasi dan Masuk'}
              </button>
            </form>
            <button
              type="button"
              onClick={handleCancelMfa}
              disabled={isLoading}
              className="w-full py-2 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 disabled:opacity-50"
            >
              Batalkan dan keluar
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="login-username" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              {isLocalAuthMode ? 'Username / Email Pegawai' : 'Email Pegawai'}
            </label>
            <div className="relative">
              <UserIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
              ref={usernameInputRef}
              id="login-username"
              type={isLocalAuthMode ? 'text' : 'email'}
              autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-3 pl-10 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              placeholder={isLocalAuthMode ? 'username atau email staf' : 'nama@klinik.id'}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="login-password" className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              {isLocalAuthMode ? 'Kata Sandi Lokal' : 'Kata Sandi Akun Staf'}
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 pl-10 pr-10 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="Masukkan kata sandi"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                aria-pressed={showPassword}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading || loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
          {isLoading ? 'Memvalidasi Akun...' : 'Masuk ke Sistem Inti'}
          </button>
        </form>
        )}

        {!mfaFlow && (
          <>
          <button
            type="button"
            onClick={handlePasswordReset}
            disabled={isLoading || loading}
            className="mt-3 w-full text-sm font-semibold text-blue-700 hover:text-blue-800 dark:text-blue-300 dark:hover:text-blue-200 disabled:opacity-50"
          >
            {isLocalAuthMode ? 'Lupa sandi? Hubungi administrator' : 'Lupa kata sandi? Kirim tautan reset'}
          </button>

          {isFirebaseConfigured && !isLocalAuthMode && <div className="relative my-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-700" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-white px-2.5 font-medium text-slate-400 dark:bg-slate-900">
                atau gunakan akun Google institusi
              </span>
            </div>
          </div>}

          {isFirebaseConfigured && !isLocalAuthMode && <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={isLoading || loading}
            className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
              />
            </svg>
            Masuk dengan Akun Google
          </button>}
          </>
        )}

        <p className="mt-5 text-center text-xs text-slate-500 dark:text-slate-400">
          {isLocalAuthMode
            ? 'Akun dan sesi diverifikasi oleh server lokal. Kata sandi dikelola administrator fasilitas kesehatan.'
            : 'Akses memerlukan akun Firebase aktif dan verifikasi dua langkah melalui aplikasi autentikator.'}
        </p>

        <p className="text-center text-[10px] text-slate-500 dark:text-slate-400 mt-5 font-semibold tracking-widest uppercase">
          MYITARU · MYITARU SIMK
        </p>
      </div>
  );

  if (embedded) {
    return loginCard;
  }

  const showRoleCards = import.meta.env.DEV;

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 dark:bg-slate-950 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-5xl">
        <header className="mb-8 text-center">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3.5 py-1.5 text-xs font-semibold text-blue-800 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-200">
            <Server className="h-3.5 w-3.5" />
            Akses staf terverifikasi · RBAC MYITARU
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
            Portal Sistem Inti <span className="text-blue-700 dark:text-blue-400">MYITARU</span>
          </h1>
          <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">
            Sistem Informasi Manajemen Klinik &amp; Rumah Sakit Pendidikan Terintegrasi
          </p>
        </header>

        <div className={`grid grid-cols-1 items-start gap-6 ${showRoleCards ? 'lg:grid-cols-12' : ''}`}>
          {/* Form login lebih dulu di DOM agar Tab langsung ke username; di desktop tetap tampil di kanan. */}
          <div className={showRoleCards ? 'lg:col-span-5 lg:order-2' : 'mx-auto w-full max-w-xl'}>{loginCard}</div>
          {showRoleCards && <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:col-span-7 lg:order-1">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Akses Berbasis Peran (RBAC)
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  Pilih peran kerja untuk melihat cakupan tugas, lalu masuk dengan akun staf Anda.
                </p>
              </div>
              <Building2 className="h-6 w-6 shrink-0 text-blue-600" />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {ROLE_CARDS.map((item) => {
                const Icon = item.icon;
                const isSelected = selectedRoleId === item.roleId;

                return (
                  <button
                    key={item.roleId}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      setSelectedRoleId(item.roleId);
                      if (isLocalAuthMode) setUsername(item.loginIdentifier);
                      usernameInputRef.current?.focus();
                    }}
                    className={`group flex items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/70 ring-2 ring-blue-500/20 dark:border-blue-400 dark:bg-blue-950/40'
                        : 'border-slate-200 hover:border-blue-500 hover:bg-blue-50/40 dark:border-slate-700 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span className={`shrink-0 rounded-lg p-2.5 ${item.badgeColor}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-slate-900 group-hover:text-blue-700 dark:text-white dark:group-hover:text-blue-300">
                          {item.title}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" />
                      </span>
                      <span className="mt-0.5 block text-[11px] text-slate-500 dark:text-slate-400">
                        {item.subtitle}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-xs leading-relaxed text-blue-900 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-200">
              <ShieldCheck className="mr-1.5 inline h-4 w-4 align-text-bottom" />
              {selectedRoleId
                ? `Peran dipilih: ${ROLE_CARDS.find((role) => role.roleId === selectedRoleId)?.title}. Hak akses akhir tetap mengikuti profil akun yang diverifikasi server.`
                : `Kartu peran hanya membantu memilih konteks kerja. Kartu ini tidak melewati login atau memberikan akses tanpa akun staf aktif${isLocalAuthMode ? '.' : ' dan verifikasi MFA.'}`}
            </div>
          </section>}
        </div>
      </div>
    </div>
  );
}
