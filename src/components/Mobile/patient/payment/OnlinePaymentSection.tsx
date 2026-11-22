import React, { useCallback, useEffect, useState } from 'react';
import { CreditCard, Receipt } from 'lucide-react';
import { EmptyState, Modal, SkeletonList } from '../ui';
import { formatRupiah } from '../utils';
import { PaymentChannelPicker } from './PaymentChannelPicker';
import { PaymentDetail } from './PaymentDetail';
import {
  PAYMENT_UNAVAILABLE_MESSAGE,
  paymentApi,
  PaymentApiError,
  type PatientBill,
  type PatientPayment,
  type PaymentChannel
} from './paymentApi';

type Step = { kind: 'closed' } | { kind: 'picker'; bill: PatientBill } | { kind: 'detail'; payment: PatientPayment };

/** Daftar tagihan pasien + alur "Bayar Sekarang" (pilih kanal -> instruksi -> status). */
export const OnlinePaymentSection: React.FC<{ token?: string | null }> = ({ token }) => {
  const [bills, setBills] = useState<PatientBill[] | null>(null);
  const [channels, setChannels] = useState<PaymentChannel[]>([]);
  const [unavailable, setUnavailable] = useState<PaymentChannel[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'closed' });
  const [busyChannel, setBusyChannel] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [billRes, channelRes] = await Promise.all([paymentApi.bills(token), paymentApi.channels(token)]);
      setBills(billRes.bills);
      setChannels(channelRes.channels);
      setUnavailable(channelRes.unavailable);
      setLoadError(null);
    } catch (error) {
      setBills([]);
      setLoadError(error instanceof PaymentApiError ? error.message : 'Gagal memuat tagihan.');
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  // Kembali dari halaman e-wallet/PayPal: ?payment_id=... membuka status pembayaran.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const paymentId = params.get('payment_id');
    if (!paymentId) return;
    params.delete('payment_id');
    params.delete('payment_result');
    const query = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    paymentApi.status(paymentId, token)
      .then(({ payment }) => setStep({ kind: 'detail', payment }))
      .catch(() => undefined);
  }, [token]);

  const startPayment = async (bill: PatientBill, channel: PaymentChannel) => {
    setBusyChannel(channel.id);
    setCreateError(null);
    try {
      const { payment } = await paymentApi.create(bill.id, channel.id, token);
      setStep({ kind: 'detail', payment });
    } catch (error) {
      setCreateError(
        error instanceof PaymentApiError && error.status === 503
          ? PAYMENT_UNAVAILABLE_MESSAGE
          : error instanceof Error ? error.message : 'Gagal membuat pembayaran.'
      );
    } finally {
      setBusyChannel(null);
    }
  };

  const onlineAvailable = channels.length > 0;
  const close = () => {
    setStep({ kind: 'closed' });
    setCreateError(null);
  };

  if (bills === null) return <SkeletonList rows={1} label="Memuat tagihan..." />;

  const payableBills = bills.filter((bill) => bill.payable);

  return (
    <section aria-labelledby="online-bills-heading" className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
      <h3 id="online-bills-heading" className="text-base font-extrabold text-slate-900 flex items-center gap-2">
        <CreditCard className="w-5 h-5 text-[#0B3D91]" aria-hidden="true" />
        Tagihan &amp; Pembayaran
      </h3>

      {loadError && <p role="alert" className="text-sm text-rose-700">{loadError}</p>}

      {!onlineAvailable && !loadError && (
        <p role="status" className="text-sm rounded-xl bg-amber-50 border border-amber-200 text-amber-900 p-3">
          {PAYMENT_UNAVAILABLE_MESSAGE}
        </p>
      )}

      {bills.length === 0 ? (
        <EmptyState icon={Receipt} title="Belum ada tagihan" description="Tagihan yang diterbitkan kasir akan tampil di sini." />
      ) : (
        <ul className="space-y-3">
          {bills.map((bill) => (
            <li key={bill.id} className="rounded-xl border border-slate-200 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-mono text-slate-600">{bill.no_billing}</p>
                  {bill.layanan && <p className="text-sm font-bold text-slate-900">{bill.layanan}</p>}
                  {bill.tanggal && <p className="text-sm text-slate-600">{bill.tanggal.slice(0, 10)}</p>}
                </div>
                <span className="text-sm font-bold text-[#0B3D91] bg-blue-50 px-3 py-1 rounded-full">{bill.status}</span>
              </div>
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <span className="text-sm text-slate-700">{bill.payable ? 'Sisa tagihan' : 'Total'}</span>
                <span className="font-mono tabular-nums font-extrabold text-slate-900">
                  {formatRupiah(bill.payable ? bill.sisa : bill.total)}
                </span>
              </div>
              {bill.payable && onlineAvailable && (
                <button
                  type="button"
                  onClick={() => setStep({ kind: 'picker', bill })}
                  className="w-full min-h-[48px] rounded-xl bg-[#0B3D91] hover:bg-[#08306f] text-white font-bold text-sm cursor-pointer"
                >
                  Bayar Sekarang
                  <span className="sr-only"> tagihan {bill.no_billing}</span>
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {payableBills.length > 0 && !onlineAvailable && (
        <p className="text-sm text-slate-600">Tunjukkan nomor tagihan di atas kepada kasir untuk pembayaran.</p>
      )}

      <Modal
        open={step.kind !== 'closed'}
        onClose={close}
        closeLabel="Tutup pembayaran"
        title={step.kind === 'detail' ? 'Selesaikan Pembayaran' : 'Pilih Metode Pembayaran'}
        description={step.kind === 'picker' ? `Tagihan ${step.bill.no_billing} · ${formatRupiah(step.bill.sisa)}` : undefined}
        maxWidthClass="max-w-lg"
      >
        {step.kind === 'picker' && (
          <div className="space-y-3">
            {createError && <p role="alert" className="text-sm text-rose-700">{createError}</p>}
            <PaymentChannelPicker
              channels={channels}
              unavailable={unavailable}
              busyChannel={busyChannel}
              onSelect={(channel) => startPayment(step.bill, channel)}
            />
          </div>
        )}
        {step.kind === 'detail' && (
          <PaymentDetail
            key={step.payment.id}
            initialPayment={step.payment}
            token={token}
            onPaid={() => void load()}
            onChooseAnother={() => {
              const bill = bills.find((b) => b.id === step.payment.bill_id);
              if (bill && bill.payable) setStep({ kind: 'picker', bill });
              else close();
            }}
          />
        )}
      </Modal>
    </section>
  );
};
