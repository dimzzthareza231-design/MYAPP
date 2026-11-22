import React, { useEffect, useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Clock, Copy, ExternalLink, Smartphone, XCircle } from 'lucide-react';
import { formatRupiah } from '../utils';
import { paymentApi, PaymentApiError, type PatientPayment } from './paymentApi';

const POLL_INTERVAL_MS = 5000;

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

function formatCharge(payment: PatientPayment): string {
  if (payment.charge_currency === 'IDR') return formatRupiah(payment.amount);
  const charge = new Intl.NumberFormat('id-ID', { style: 'currency', currency: payment.charge_currency }).format(payment.charge_amount);
  return `${charge} (setara ${formatRupiah(payment.amount)})`;
}

/** Detail instruksi pembayaran + polling status tiap 5 detik sampai lunas/gagal/kedaluwarsa. */
export const PaymentDetail: React.FC<{
  initialPayment: PatientPayment;
  token?: string | null;
  onPaid: (payment: PatientPayment) => void;
  onChooseAnother: () => void;
}> = ({ initialPayment, token, onPaid, onChooseAnother }) => {
  const [payment, setPayment] = useState(initialPayment);
  const [now, setNow] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const paidNotified = useRef(false);

  // Polling status.
  useEffect(() => {
    if (payment.status !== 'PENDING') return;
    let cancelled = false;
    const timer = window.setInterval(async () => {
      try {
        const { payment: next } = await paymentApi.status(payment.id, token);
        if (!cancelled) {
          setPayment(next);
          setPollError(null);
        }
      } catch (error) {
        if (!cancelled) setPollError(error instanceof PaymentApiError ? error.message : 'Gagal memeriksa status pembayaran.');
      }
    }, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [payment.id, payment.status, token]);

  // Hitung mundur.
  useEffect(() => {
    if (payment.status !== 'PENDING' || !payment.expires_at) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [payment.status, payment.expires_at]);

  useEffect(() => {
    if (payment.status === 'PAID' && !paidNotified.current) {
      paidNotified.current = true;
      onPaid(payment);
    }
  }, [payment, onPaid]);

  const copyVa = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  };

  const remainingMs = payment.expires_at ? Date.parse(payment.expires_at) - now : null;
  const instructions = payment.instructions;

  if (payment.status === 'PAID') {
    return (
      <div role="status" aria-live="polite" className="text-center space-y-3 py-4">
        <CheckCircle2 className="w-14 h-14 mx-auto text-emerald-600" aria-hidden="true" />
        <p className="text-lg font-extrabold text-slate-900">Pembayaran berhasil</p>
        <p className="text-sm text-slate-600">
          {formatCharge(payment)} via {payment.channel_label} telah diterima. Status tagihan Anda diperbarui otomatis.
        </p>
      </div>
    );
  }

  if (payment.status === 'FAILED' || payment.status === 'EXPIRED') {
    return (
      <div role="alert" className="text-center space-y-3 py-4">
        <XCircle className="w-14 h-14 mx-auto text-rose-600" aria-hidden="true" />
        <p className="text-lg font-extrabold text-slate-900">
          {payment.status === 'EXPIRED' ? 'Waktu pembayaran habis' : 'Pembayaran gagal'}
        </p>
        <p className="text-sm text-slate-600">
          Tidak ada dana yang ditagihkan untuk transaksi ini. Silakan pilih metode lain atau bayar di kasir.
        </p>
        <button
          type="button"
          onClick={onChooseAnother}
          className="min-h-[48px] px-5 rounded-xl bg-[#0B3D91] text-white font-bold text-sm cursor-pointer"
        >
          Pilih Metode Lain
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-sm space-y-1">
        <div className="flex justify-between gap-3">
          <span className="text-slate-600">Metode</span>
          <span className="font-bold text-slate-900">{payment.channel_label}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-slate-600">Jumlah</span>
          <span className="font-mono tabular-nums font-extrabold text-[#0B3D91] text-right">{formatCharge(payment)}</span>
        </div>
      </div>

      {instructions?.kind === 'virtual_account' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">
            Transfer tepat sesuai jumlah ke nomor Virtual Account {instructions.bank} berikut melalui m-banking, internet banking, atau ATM.
          </p>
          <div className="flex items-center gap-2 rounded-xl border-2 border-[#0B3D91]/30 bg-white p-3">
            <span className="flex-1 font-mono text-xl font-extrabold tracking-wider text-slate-900 break-all" aria-label={`Nomor Virtual Account ${instructions.va_number.split('').join(' ')}`}>
              {instructions.va_number}
            </span>
            <button
              type="button"
              onClick={() => copyVa(instructions.va_number)}
              className="min-h-[44px] px-3 rounded-lg border border-slate-200 hover:border-[#0B3D91] text-sm font-bold text-slate-800 flex items-center gap-1.5 cursor-pointer"
            >
              <Copy className="w-4 h-4" aria-hidden="true" />
              {copied ? 'Tersalin' : 'Salin'}
            </button>
          </div>
          <span className="sr-only" aria-live="polite">{copied ? 'Nomor Virtual Account disalin.' : ''}</span>
        </div>
      )}

      {instructions?.kind === 'qr' && (
        <div className="space-y-2 text-center">
          <p className="text-sm text-slate-700">Pindai kode QRIS ini dengan aplikasi m-banking atau e-wallet apa pun.</p>
          <div className="inline-block bg-white p-3 rounded-xl border border-slate-200">
            <QRCodeSVG value={instructions.qr_string} size={232} level="M" role="img" aria-label="Kode QRIS pembayaran tagihan" />
          </div>
        </div>
      )}

      {instructions?.kind === 'redirect' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">
            Lanjutkan ke {payment.channel_label} untuk menyetujui pembayaran, lalu kembali ke halaman ini.
          </p>
          {instructions.deeplink && (
            <a
              href={instructions.deeplink}
              className="w-full min-h-[48px] rounded-xl bg-[#0B3D91] text-white font-bold text-sm flex items-center justify-center gap-2"
            >
              <Smartphone className="w-4 h-4" aria-hidden="true" />
              Buka Aplikasi {payment.channel_label}
            </a>
          )}
          <a
            href={instructions.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`w-full min-h-[48px] rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${
              instructions.deeplink ? 'border border-slate-200 bg-white text-slate-800' : 'bg-[#0B3D91] text-white'
            }`}
          >
            <ExternalLink className="w-4 h-4" aria-hidden="true" />
            Bayar dengan {payment.channel_label}
            <span className="sr-only">(membuka tab baru)</span>
          </a>
        </div>
      )}

      {remainingMs !== null && (
        <p className="flex items-center justify-center gap-2 text-sm text-slate-700">
          <Clock className="w-4 h-4" aria-hidden="true" />
          <span>
            Selesaikan dalam <span className="font-mono tabular-nums font-bold" aria-live="off">{formatRemaining(remainingMs)}</span>
          </span>
        </p>
      )}

      <p role="status" aria-live="polite" className="text-center text-sm text-slate-600">
        {pollError || 'Menunggu pembayaran... status diperbarui otomatis.'}
      </p>

      <button
        type="button"
        onClick={onChooseAnother}
        className="w-full min-h-[44px] rounded-xl border border-slate-200 text-sm font-bold text-slate-700 cursor-pointer"
      >
        Pilih Metode Lain
      </button>
    </div>
  );
};
