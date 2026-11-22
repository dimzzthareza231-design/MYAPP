import React, { useId, useState } from 'react';
import { ArrowLeft, PhoneCall, UserCheck } from 'lucide-react';
import { PWAInstallButton } from '../../PWA/PWAInstallButton';
import { BrandLogo } from '../../Common/BrandLogo';
import { localTodayIso } from './utils';

const inputClass =
  'w-full px-4 py-3 min-h-[48px] rounded-xl border border-slate-300 text-base focus:border-[#0B3D91] focus:ring-2 focus:ring-[#0B3D91]/15 outline-none';

const GoogleIcon: React.FC = () => (
  <svg className="w-5 h-5" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#4285F4"
      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
    />
    <path
      fill="#34A853"
      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
    />
    <path
      fill="#FBBC05"
      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
    />
    <path
      fill="#EA4335"
      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
    />
  </svg>
);

const RmDobFields: React.FC<{
  noRm: string;
  dob: string;
  onNoRmChange: (value: string) => void;
  onDobChange: (value: string) => void;
  required?: boolean;
}> = ({ noRm, dob, onNoRmChange, onDobChange, required }) => {
  const rmId = useId();
  const dobId = useId();
  return (
    <>
      <div>
        <label htmlFor={rmId} className="block text-sm font-bold text-slate-700 mb-1.5">
          Nomor Rekam Medis (No. RM)
        </label>
        <input
          id={rmId}
          type="text"
          required={required}
          autoComplete="off"
          inputMode="text"
          autoCapitalize="characters"
          value={noRm}
          onChange={(e) => onNoRmChange(e.target.value)}
          placeholder="Tertera di kartu berobat Anda"
          className={`${inputClass} font-mono uppercase placeholder:normal-case placeholder:font-sans`}
        />
      </div>
      <div>
        <label htmlFor={dobId} className="block text-sm font-bold text-slate-700 mb-1.5">
          Tanggal Lahir Pasien
        </label>
        <input
          id={dobId}
          type="date"
          required={required}
          max={localTodayIso()}
          value={dob}
          onChange={(e) => onDobChange(e.target.value)}
          className={inputClass}
        />
      </div>
    </>
  );
};

export const LoginScreen: React.FC<{
  pendingGoogleUser: { email: string; displayName: string } | null;
  isVerifying: boolean;
  authLoading: boolean;
  onBack: () => void;
  onVerifyRmDob: (noRm: string, dob: string) => void;
  onGoogleLogin: () => void;
  onBindGoogle: (noRm: string, dob: string) => void;
}> = ({ pendingGoogleUser, isVerifying, authLoading, onBack, onVerifyRmDob, onGoogleLogin, onBindGoogle }) => {
  const [authMode, setAuthMode] = useState<'rm_dob' | 'google'>('rm_dob');
  const [noRmInput, setNoRmInput] = useState('');
  const [dobInput, setDobInput] = useState('');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      <header className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between gap-3 sticky top-0 z-30 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-[#0B3D91] cursor-pointer min-h-[44px] pr-2"
        >
          <ArrowLeft className="w-5 h-5" aria-hidden="true" />
          <span>Portal RS</span>
        </button>

        <div className="flex items-center gap-2">
          <BrandLogo alt="" className="w-7 h-7 rounded-lg object-cover" />
          <span className="font-extrabold text-[#0B3D91] text-sm">MYITARU Mobile</span>
        </div>

        <PWAInstallButton variant="subtle" label="Pasang App" showAlwaysGuide />
      </header>

      <main className="flex-1 flex items-center justify-center p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="w-full max-w-md bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <BrandLogo alt="MYITARU" className="w-14 h-14 rounded-2xl mx-auto shadow-md object-cover" />
            <h1 className="text-2xl font-extrabold text-slate-900">Aplikasi Pasien MYITARU</h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              Cek nomor antrean poli, jadwal dokter, hasil laboratorium &amp; radiologi, serta tagihan langsung dari ponsel.
            </p>
          </div>

          {pendingGoogleUser ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                onBindGoogle(noRmInput, dobInput);
              }}
            >
              <div className="rounded-2xl bg-blue-50 border border-blue-200 p-4 text-sm space-y-1">
                <p className="font-bold text-[#0B3D91] flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4" aria-hidden="true" />
                  Google Terverifikasi: {pendingGoogleUser.displayName}
                </p>
                <p className="text-slate-600 font-mono break-all">{pendingGoogleUser.email}</p>
                <p className="text-slate-600 pt-1">
                  Email ini belum terhubung dengan No. Rekam Medis. Masukkan No. RM + Tanggal Lahir Anda sekali saja untuk
                  sinkronisasi otomatis.
                </p>
              </div>

              <RmDobFields
                noRm={noRmInput}
                dob={dobInput}
                onNoRmChange={setNoRmInput}
                onDobChange={setDobInput}
                required
              />
              <button
                type="submit"
                disabled={isVerifying}
                className="w-full py-3.5 rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white font-bold text-sm cursor-pointer min-h-[48px] disabled:opacity-60"
              >
                {isVerifying ? 'Menghubungkan...' : 'Hubungkan No. RM Saya'}
              </button>
            </form>
          ) : (
            <>
              <div role="group" aria-label="Metode masuk" className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-100">
                {(
                  [
                    { id: 'rm_dob', label: 'No. RM & Tgl Lahir' },
                    { id: 'google', label: 'Akun Google' }
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    aria-pressed={authMode === mode.id}
                    onClick={() => setAuthMode(mode.id)}
                    className={`py-2.5 px-3 rounded-xl text-sm font-bold transition cursor-pointer min-h-[44px] ${
                      authMode === mode.id ? 'bg-white text-[#0B3D91] shadow-xs' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>

              {authMode === 'rm_dob' ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    onVerifyRmDob(noRmInput, dobInput);
                  }}
                  className="space-y-4"
                >
                  <RmDobFields
                    noRm={noRmInput}
                    dob={dobInput}
                    onNoRmChange={setNoRmInput}
                    onDobChange={setDobInput}
                    required
                  />
                  <button
                    type="submit"
                    disabled={isVerifying}
                    className="w-full py-3.5 rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white font-bold text-sm transition disabled:opacity-60 cursor-pointer min-h-[48px]"
                  >
                    {isVerifying ? 'Memverifikasi Identitas...' : 'Verifikasi & Masuk'}
                  </button>
                </form>
              ) : (
                <div className="space-y-4 py-2">
                  <p className="text-sm text-slate-600 text-center leading-relaxed">
                    Masuk sekali ketuk dengan Akun Google Anda yang terhubung dengan rekam medis MYITARU SIMK.
                  </p>
                  <button
                    type="button"
                    disabled={isVerifying || authLoading}
                    onClick={onGoogleLogin}
                    className="w-full py-3.5 px-4 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-sm shadow-xs flex items-center justify-center gap-3 cursor-pointer min-h-[48px] disabled:opacity-60"
                  >
                    <GoogleIcon />
                    <span>{isVerifying ? 'Menghubungkan Google...' : 'Masuk dengan Akun Google'}</span>
                  </button>
                </div>
              )}
            </>
          )}

          <div className="pt-2 text-center border-t border-slate-100">
            <a
              href="tel:119"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-[#DC2626] min-h-[44px] px-2"
            >
              <PhoneCall className="w-4 h-4" aria-hidden="true" />
              <span>Gawat Darurat: 119</span>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
};
