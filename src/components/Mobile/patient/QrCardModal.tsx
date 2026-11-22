import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { QrCode } from 'lucide-react';
import { Modal } from './ui';

/**
 * Kartu pasien QR: token opaque berumur pendek yang diterbitkan server (tanpa nama/No. RM
 * di payload) dan diperbarui otomatis sebelum kedaluwarsa.
 */
export const QrCardModal: React.FC<{
  open: boolean;
  onClose: () => void;
  token: string | null;
  patientName?: string;
  noRm?: string;
  queueNumber?: string;
}> = ({ open, onClose, token, patientName, noRm, queueNumber }) => {
  const [qrValue, setQrValue] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  useEffect(() => {
    if (!open || !token) {
      setQrValue(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const loadQrCard = async () => {
      setStatus('loading');
      try {
        const res = await fetch('/api/patient/qr-card', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !data?.success || typeof data.qr_value !== 'string') {
          setQrValue(null);
          setStatus('error');
          return;
        }
        setQrValue(data.qr_value);
        setStatus('idle');
        const expiresAt = Date.parse(data.expires_at);
        const refreshInMs = Number.isFinite(expiresAt) ? Math.max(30_000, expiresAt - Date.now() - 60_000) : 5 * 60_000;
        refreshTimer = setTimeout(loadQrCard, refreshInMs);
      } catch {
        if (!cancelled) {
          setQrValue(null);
          setStatus('error');
        }
      }
    };
    loadQrCard();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
    };
  }, [open, token]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Kartu Pasien & Check-In QR"
      closeLabel="Tutup kartu QR"
      maxWidthClass="max-w-sm"
    >
      <div className="text-center space-y-4">
        <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 inline-block mx-auto">
          {qrValue ? (
            <QRCodeSVG value={qrValue} size={176} title="QR check-in pasien" />
          ) : (
            <div
              role={status === 'error' ? 'alert' : 'status'}
              className="w-[176px] h-[176px] flex flex-col items-center justify-center gap-2 text-sm text-slate-600 px-3"
            >
              {status === 'error' ? (
                <>
                  <QrCode className="w-8 h-8 text-slate-400" aria-hidden="true" />
                  QR belum dapat ditampilkan. Periksa koneksi atau tunjukkan No. RM ke petugas pendaftaran.
                </>
              ) : (
                <>
                  <span className="w-full h-full animate-pulse rounded-xl bg-slate-200/80" aria-hidden="true" />
                  <span className="sr-only">Menyiapkan QR...</span>
                </>
              )}
            </div>
          )}
        </div>
        <div>
          {patientName && <p className="font-bold text-slate-900">{patientName}</p>}
          {(noRm || queueNumber) && (
            <p className="text-sm font-mono text-[#0B3D91] mt-0.5">
              {[noRm, queueNumber && `Antrean ${queueNumber}`].filter(Boolean).join(' · ')}
            </p>
          )}
          <p className="text-sm text-slate-600 mt-2">
            Pindai QR ini pada Anjungan Mandiri (APM) saat tiba di MYITARU. QR diperbarui otomatis setiap beberapa menit.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="w-full min-h-[48px] rounded-xl bg-[#0B3D91] text-white font-bold text-sm cursor-pointer"
        >
          Tutup
        </button>
      </div>
    </Modal>
  );
};
