import React, { useState } from 'react';
import { Eye, EyeOff, LogIn, User as UserIcon, Lock, Sparkles, ShieldCheck, Stethoscope } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../contexts/AuthContext';
import { useHospital } from '../contexts/HospitalContext';
import { CloudflareTurnstile } from './Common/CloudflareTurnstile';
import { BrandLogo } from './Common/BrandLogo';

export function Login({ embedded = false }: { embedded?: boolean }) {
  const { login, loading } = useAuth();
  const { hospitalSettings } = useHospital();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Cloudflare Turnstile State
  const [turnstileEnabled] = useState(false); // Forced to false to hide testing watermark
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!username.trim() || !password.trim()) {
      toast.error('Username dan password wajib diisi');
      return;
    }

    if (turnstileEnabled && !turnstileToken) {
      toast.error('Harap selesaikan verifikasi Cloudflare Turnstile terlebih dahulu');
      return;
    }

    setIsLoading(true);

    try {
      const result = await login(username, password);
      if (result.success) {
        toast.success(result.message);
        setUsername('');
        setPassword('');
      } else {
        toast.error(result.message);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Gagal masuk');
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

        {/* Login Google hanya tersedia di aplikasi pasien (web publik); staf masuk dengan akun pegawai. */}
        {/* Form Login */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              Username Pegawai
            </label>
            <div className="relative">
              <UserIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full p-3 pl-10 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="Masukkan username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 uppercase tracking-wider">
              Kata Sandi
            </label>
            <div className="relative">
              <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 pl-10 pr-10 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none text-sm"
                placeholder="Masukkan kata sandi"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Cloudflare Turnstile Bot Protection Widget */}
          {turnstileEnabled && (
            <div className="py-1">
              <CloudflareTurnstile
                onSuccess={(token) => setTurnstileToken(token)}
                onExpire={() => setTurnstileToken(null)}
                onError={() => setTurnstileToken(null)}
                action="login"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || loading || (turnstileEnabled && !turnstileToken)}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 disabled:opacity-50 text-sm cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            {isLoading ? 'Memvalidasi Akun...' : 'Masuk'}
          </button>
        </form>

        {/* Quick Demo Test Accounts */}
        <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700/80">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              Akun Uji Coba Cepat:
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-xs">
            <button
              type="button"
              onClick={() => { setUsername('mhs001'); setPassword('mahasiswa001'); }}
              className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-indigo-50 dark:bg-slate-700/60 dark:hover:bg-indigo-950/60 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-indigo-400 dark:hover:border-indigo-500 text-left transition-all"
            >
              <div className="font-bold text-[11px] truncate">👑 Super Admin</div>
              <div className="text-[9px] text-slate-400 dark:text-slate-400 font-mono">mhs001</div>
            </button>
            <button
              type="button"
              onClick={() => { setUsername('dokter'); setPassword('dokter123'); }}
              className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-cyan-50 dark:bg-slate-700/60 dark:hover:bg-cyan-950/60 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-cyan-400 dark:hover:border-cyan-500 text-left transition-all"
            >
              <div className="font-bold text-[11px] truncate">🩺 Dokter Sp.PD</div>
              <div className="text-[9px] text-slate-400 dark:text-slate-400 font-mono">dokter</div>
            </button>
            <button
              type="button"
              onClick={() => { setUsername('perawat'); setPassword('perawat123'); }}
              className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 dark:bg-slate-700/60 dark:hover:bg-emerald-950/60 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-emerald-400 dark:hover:border-emerald-500 text-left transition-all"
            >
              <div className="font-bold text-[11px] truncate">💉 Perawat</div>
              <div className="text-[9px] text-slate-400 dark:text-slate-400 font-mono">perawat</div>
            </button>
            <button
              type="button"
              onClick={() => { setUsername('rekammedis'); setPassword('rm123'); }}
              className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 dark:bg-slate-700/60 dark:hover:bg-blue-950/60 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-blue-400 dark:hover:border-blue-500 text-left transition-all"
            >
              <div className="font-bold text-[11px] truncate">📁 Rekam Medis</div>
              <div className="text-[9px] text-slate-400 dark:text-slate-400 font-mono">rekammedis</div>
            </button>
            <button
              type="button"
              onClick={() => { setUsername('apoteker'); setPassword('apotek123'); }}
              className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-teal-50 dark:bg-slate-700/60 dark:hover:bg-teal-950/60 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-teal-400 dark:hover:border-teal-500 text-left transition-all"
            >
              <div className="font-bold text-[11px] truncate">💊 Apoteker</div>
              <div className="text-[9px] text-slate-400 dark:text-slate-400 font-mono">apoteker</div>
            </button>
            <button
              type="button"
              onClick={() => { setUsername('kasir'); setPassword('kasir123'); }}
              className="px-2 py-1.5 rounded-lg bg-slate-100 hover:bg-purple-50 dark:bg-slate-700/60 dark:hover:bg-purple-950/60 border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-purple-400 dark:hover:border-purple-500 text-left transition-all"
            >
              <div className="font-bold text-[11px] truncate">💳 Kasir</div>
              <div className="text-[9px] text-slate-400 dark:text-slate-400 font-mono">kasir</div>
            </button>
          </div>
        </div>

        <p className="text-center text-[10px] text-slate-400 mt-5 font-semibold tracking-widest uppercase opacity-70">
          MYITARU · MYITARU SIMK
        </p>
      </div>
  );

  if (embedded) {
    return loginCard;
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      <div className="bg-[#07265C] text-white border-b border-amber-400/30 py-2.5 px-4 sm:px-6">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-2 font-semibold">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 font-mono font-bold tracking-wider">
              <Stethoscope className="w-3.5 h-3.5" /> SIMK-INTI
            </span>
            <span>Aplikasi Inti Operasional Klinis &amp; RME · MYITARU</span>
          </span>
          <span className="font-mono text-sky-200 text-[11px]">/staff/login</span>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-5">{loginCard}</div>

        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-sm space-y-5">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-[#0B3D91] dark:text-sky-400">
              APLIKASI INTI KLINIK UTAMA 24 JAM · OPERASIONAL MEDIS
            </p>
            <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white mt-1">
              Sistem Informasi Manajemen Klinik &amp; Rekam Medis Elektronik
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
              Gerbang autentikasi khusus tenaga medis, perawat, apoteker, analis laboratorium, kasir, dan administrator operasional MYITARU SIMK.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
            {[
              {
                title: 'Pendaftaran, Antrean & IGD 24 Jam',
                desc: 'Registrasi pasien baru/lama RM-YYMMDD, Triase Merah/Kuning/Hijau otomatis, dan konversi rawat inap.'
              },
              {
                title: 'Rawat Jalan & RME Patient360',
                desc: '18+ Poliklinik spesialis, AI Scribe Talk-to-SOAP, pencarian ICD-10, dan berkas legal-medik KARS.'
              },
              {
                title: 'Rawat Inap, ICU & Kamar Operasi',
                desc: 'Peta tempat tidur real-time, pemantauan ventilator ICU, serta checklist keselamatan bedah WHO.'
              },
              {
                title: 'Lab LIS, Radiologi PACS & Farmasi',
                desc: 'Order otomatis dari SOAP/RME ke Worklist LIS/RIS, verifikasi interaksi obat, dan potong stok depo.'
              },
              {
                title: 'Kasir Billing, BPJS VClaim & SatuSehat',
                desc: 'Akumulasi tarif tindakan-lab-rad-resep real-time, SEP VClaim, INA-CBGs, dan sinkronisasi FHIR.'
              },
              {
                title: 'Keamanan Peran & Jejak Audit',
                desc: 'Kontrol akses berbasis peran klinis dan log aktivitas terenkripsi sesuai PMK 24/2022.'
              }
            ].map((mod) => (
              <div
                key={mod.title}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/60 space-y-1"
              >
                <p className="font-bold text-slate-900 dark:text-white">{mod.title}</p>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">{mod.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
