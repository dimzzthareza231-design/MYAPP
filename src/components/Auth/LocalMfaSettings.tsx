import React, { useCallback, useEffect, useState } from 'react';
import { Copy, KeyRound, RefreshCw, ShieldCheck, ShieldOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { startLocalMfaEnrollment } from '../../contexts/AuthContext';

interface MfaStatus {
  available: boolean;
  enabled: boolean;
  required: boolean;
  enrollmentRequired: boolean;
  recoveryCodesRemaining: number;
}

async function postJson(path: string, body: unknown): Promise<{ ok: boolean; payload: Record<string, unknown> }> {
  const response = await fetch(path, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  return { ok: response.ok, payload };
}

function messageOf(payload: Record<string, unknown>, fallback: string): string {
  return typeof payload.message === 'string' ? payload.message : fallback;
}

const inputClass = 'w-full p-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-center font-mono tracking-widest focus:ring-2 focus:ring-blue-500 outline-none';
const primaryButton = 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50 text-sm';
const secondaryButton = 'px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-600 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center gap-2';

/** Pengaturan MFA TOTP untuk akun staf lokal yang sedang masuk (AUTH_MODE=local). */
export function LocalMfaSettings() {
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [enrollment, setEnrollment] = useState<{ qrCodeUrl: string; secretKey: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [manageCode, setManageCode] = useState('');

  const loadStatus = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/mfa/status', { credentials: 'same-origin' });
      const payload = await response.json().catch(() => ({})) as { mfa?: MfaStatus; message?: string };
      if (!response.ok || !payload.mfa) throw new Error(payload.message || 'Status MFA tidak dapat dimuat.');
      setStatus(payload.mfa);
    } catch (error: any) {
      toast.error(error?.message || 'Status MFA tidak dapat dimuat.');
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    try {
      await action();
    } catch (error: any) {
      toast.error(error?.message || 'Permintaan MFA gagal.');
    } finally {
      setBusy(false);
    }
  };

  const beginEnrollment = () => run(async () => {
    setRecoveryCodes(null);
    setEnrollment(await startLocalMfaEnrollment());
    setCode('');
  });

  const confirmEnrollment = (e: React.FormEvent) => {
    e.preventDefault();
    void run(async () => {
      const { ok, payload } = await postJson('/api/auth/mfa/enroll/confirm', { code });
      if (!ok || !Array.isArray(payload.recoveryCodes)) throw new Error(messageOf(payload, 'Kode tidak valid.'));
      setRecoveryCodes(payload.recoveryCodes as string[]);
      setEnrollment(null);
      setCode('');
      toast.success('Verifikasi dua langkah aktif. Sesi lain akun ini telah diakhiri.');
      await loadStatus();
    });
  };

  const regenerate = () => run(async () => {
    const { ok, payload } = await postJson('/api/auth/mfa/recovery-codes', { code: manageCode });
    if (!ok || !Array.isArray(payload.recoveryCodes)) throw new Error(messageOf(payload, 'Kode tidak valid.'));
    setRecoveryCodes(payload.recoveryCodes as string[]);
    setManageCode('');
    toast.success('Kode pemulihan baru dibuat. Kode lama tidak berlaku lagi.');
    await loadStatus();
  });

  const disable = () => run(async () => {
    if (!window.confirm('Nonaktifkan verifikasi dua langkah untuk akun ini?')) return;
    const trimmed = manageCode.trim();
    const proof = /^\d{6}$/.test(trimmed) ? { code: trimmed } : { recoveryCode: trimmed };
    const { ok, payload } = await postJson('/api/auth/mfa/disable', proof);
    if (!ok) throw new Error(messageOf(payload, 'Kode tidak valid.'));
    setManageCode('');
    setRecoveryCodes(null);
    toast.success('Verifikasi dua langkah dinonaktifkan.');
    await loadStatus();
  });

  const copyCodes = async () => {
    if (!recoveryCodes) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      toast.success('Kode pemulihan disalin.');
    } catch {
      toast.error('Gagal menyalin. Catat kode secara manual.');
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-6 bg-white dark:bg-slate-900 rounded-2xl shadow-sm p-6 border border-slate-200 dark:border-slate-800 space-y-5">
      <div className="flex items-start gap-3">
        <span className="shrink-0 rounded-lg p-2.5 bg-indigo-600 text-white"><ShieldCheck className="w-5 h-5" /></span>
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Verifikasi Dua Langkah (TOTP)</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Lindungi akun staf lokal Anda dengan kode 6 digit dari aplikasi autentikator (Google Authenticator, Aegis, 1Password, dan sejenisnya).
          </p>
        </div>
      </div>

      {!status ? (
        <p className="text-sm text-slate-500">Memuat status MFA...</p>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 text-sm text-slate-700 dark:text-slate-300 space-y-1">
          <p>Status: <strong className={status.enabled ? 'text-emerald-600' : 'text-amber-600'}>{status.enabled ? 'Aktif' : 'Belum aktif'}</strong></p>
          {status.enabled && <p>Sisa kode pemulihan: <strong>{status.recoveryCodesRemaining}</strong></p>}
          {status.required && <p className="text-xs text-amber-700 dark:text-amber-300">Kebijakan fasilitas mewajibkan MFA untuk peran ini.</p>}
          {!status.available && <p className="text-xs text-red-600">MFA tidak tersedia: SESSION_SECRET server belum dikonfigurasi.</p>}
        </div>
      )}

      {recoveryCodes && (
        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 p-4 space-y-3">
          <p className="text-sm font-bold text-slate-800 dark:text-white">Kode pemulihan (hanya ditampilkan sekali)</p>
          <p className="text-xs text-slate-600 dark:text-slate-300">Setiap kode hanya berlaku satu kali. Simpan di tempat aman yang terpisah dari perangkat autentikator.</p>
          <ul className="grid grid-cols-2 gap-2">
            {recoveryCodes.map((item) => (
              <li key={item} className="rounded-lg bg-white dark:bg-slate-900 px-2 py-1.5 text-center font-mono text-sm text-slate-800 dark:text-slate-200 select-all">{item}</li>
            ))}
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={copyCodes} className={secondaryButton}><Copy className="w-4 h-4" /> Salin</button>
            <button type="button" onClick={() => setRecoveryCodes(null)} className={secondaryButton}>Saya sudah menyimpannya</button>
          </div>
        </div>
      )}

      {status && !status.enabled && status.available && !enrollment && (
        <button type="button" onClick={beginEnrollment} disabled={busy} className={primaryButton}>
          <KeyRound className="w-4 h-4" /> Aktifkan MFA
        </button>
      )}

      {enrollment && (
        <form onSubmit={confirmEnrollment} className="rounded-xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/40 p-4 text-center space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-300">Pindai QR dengan aplikasi autentikator, lalu masukkan kode 6 digit yang muncul.</p>
          <div className="inline-flex rounded-lg bg-white p-3"><QRCodeSVG value={enrollment.qrCodeUrl} size={160} /></div>
          <div className="text-left">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">Kunci manual</label>
            <code className="block select-all break-all rounded-lg bg-white dark:bg-slate-900 p-2 text-xs text-slate-800 dark:text-slate-200">{enrollment.secretKey}</code>
          </div>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            className={inputClass}
            placeholder="000000"
            aria-label="Kode autentikator"
          />
          <div className="flex gap-2 justify-center">
            <button type="submit" disabled={busy || code.length !== 6} className={primaryButton}><ShieldCheck className="w-4 h-4" /> Konfirmasi</button>
            <button type="button" onClick={() => setEnrollment(null)} disabled={busy} className={secondaryButton}>Batal</button>
          </div>
        </form>
      )}

      {status?.enabled && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">
            Kode autentikator saat ini
            <input
              type="text"
              autoComplete="one-time-code"
              maxLength={11}
              value={manageCode}
              onChange={(e) => setManageCode(e.target.value.toLowerCase().replace(/[^0-9a-z-]/g, '').slice(0, 11))}
              className={`mt-1 ${inputClass}`}
              placeholder="000000"
            />
          </label>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Membuat kode pemulihan baru memerlukan kode aplikasi autentikator. Menonaktifkan MFA dapat memakai kode autentikator atau kode pemulihan.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={regenerate} disabled={busy || !/^\d{6}$/.test(manageCode)} className={secondaryButton}>
              <RefreshCw className="w-4 h-4" /> Buat ulang kode pemulihan
            </button>
            {!status.required && (
              <button type="button" onClick={disable} disabled={busy || manageCode.length < 6} className={`${secondaryButton} text-red-700 dark:text-red-300`}>
                <ShieldOff className="w-4 h-4" /> Nonaktifkan MFA
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
