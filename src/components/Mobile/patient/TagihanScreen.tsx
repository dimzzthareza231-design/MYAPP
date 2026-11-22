import React from 'react';
import { ArrowUpRight, LogOut, Receipt } from 'lucide-react';
import { PWAInstallButton } from '../../PWA/PWAInstallButton';
import type { PatientDossierPayload } from './types';
import { EmptyState, SkeletonBlock, SkeletonList } from './ui';
import { displayValue, formatRupiah, hasBillingData } from './utils';
import { OnlinePaymentSection } from './payment/OnlinePaymentSection';

function authMethodLabel(dossier: PatientDossierPayload | null): string {
  const method: string | undefined = dossier?.authMethod;
  if (method === 'google') return `Akun Google${dossier?.linkedEmail ? ` (${dossier.linkedEmail})` : ''}`;
  if (method === 'otp') return 'Kode verifikasi (OTP)';
  return 'Verifikasi identitas pasien';
}

const BillingCard: React.FC<{ billing: PatientDossierPayload['billing'] | undefined }> = ({ billing }) => {
  if (!billing || !hasBillingData(billing)) {
    return (
      <EmptyState
        icon={Receipt}
        title="Belum ada tagihan"
        description="Rincian biaya layanan akan tampil di sini setelah kasir menerbitkan tagihan kunjungan Anda."
      />
    );
  }
  const items = billing.items ?? [];
  return (
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4" aria-labelledby="billing-heading">
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
        <div>
          {billing.invoiceNumber && <p className="text-sm font-mono text-slate-600">{billing.invoiceNumber}</p>}
          <h3 id="billing-heading" className="text-base font-extrabold text-slate-900 mt-0.5">
            Rincian Tagihan Layanan
          </h3>
        </div>
        {billing.status && (
          <span className="text-sm font-bold text-[#0B3D91] bg-blue-50 px-3 py-1 rounded-full">{billing.status}</span>
        )}
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-slate-600">Rincian item belum tersedia.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map((item, idx) => (
            <li key={`${item.nama}-${idx}`} className="flex items-center justify-between gap-3 text-sm">
              <div>
                <p className="font-semibold text-slate-800">{item.nama}</p>
                {item.kategori && <p className="text-sm text-slate-600">{item.kategori}</p>}
              </div>
              <span className="font-mono tabular-nums font-bold text-slate-900">{formatRupiah(item.nominal)}</span>
            </li>
          ))}
        </ul>
      )}

      <dl className="pt-3 border-t border-slate-200 space-y-1.5 text-sm">
        <div className="flex justify-between text-slate-700">
          <dt>Total Biaya Layanan</dt>
          <dd className="font-mono tabular-nums font-semibold">{formatRupiah(billing.totalBiaya)}</dd>
        </div>
        {billing.ditanggungPenjamin > 0 && (
          <div className="flex justify-between text-emerald-700">
            <dt>Ditanggung {displayValue(billing.penjamin)}</dt>
            <dd className="font-mono tabular-nums font-semibold">-{formatRupiah(billing.ditanggungPenjamin)}</dd>
          </div>
        )}
        <div className="flex justify-between text-base font-extrabold text-[#0B3D91] pt-2 border-t border-slate-100">
          <dt>Sisa Pembayaran Pasien</dt>
          <dd className="font-mono tabular-nums">{formatRupiah(billing.sisaTagihan)}</dd>
        </div>
      </dl>
    </section>
  );
};

export const TagihanScreen: React.FC<{
  dossier: PatientDossierPayload | null;
  loading: boolean;
  onLogout: () => void;
  onOpenPortal: () => void;
  /** Token sesi pasien; bila tidak diberikan, dibaca dari sessionStorage oleh klien pembayaran. */
  token?: string | null;
}> = ({ dossier, loading, onLogout, onOpenPortal, token }) => {
  const patient = dossier?.patient;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-7 space-y-4">
        {dossier ? (
          <>
            <OnlinePaymentSection token={token} />
            {hasBillingData(dossier.billing) && <BillingCard billing={dossier.billing} />}
          </>
        ) : loading ? (
          <SkeletonList rows={1} label="Memuat tagihan..." />
        ) : null}
      </div>

      <div className="lg:col-span-5 space-y-4">
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-base font-extrabold text-slate-900">Identitas Terverifikasi</h3>
          {patient ? (
            <dl className="text-sm space-y-1.5 text-slate-700">
              <div className="flex gap-1">
                <dt>Nama:</dt>
                <dd className="font-bold text-slate-900">{patient.nama}</dd>
              </div>
              <div className="flex gap-1">
                <dt>No. RM:</dt>
                <dd className="font-mono font-bold text-slate-900">{patient.no_rm}</dd>
              </div>
              <div className="flex gap-1 flex-wrap">
                <dt>Metode Masuk:</dt>
                <dd className="font-bold text-[#0B3D91] break-all">
                  {authMethodLabel(dossier)}
                </dd>
              </div>
              {patient.penjamin && (
                <div className="flex gap-1">
                  <dt>Penjamin:</dt>
                  <dd>{patient.penjamin}</dd>
                </div>
              )}
              {patient.golongan_darah && (
                <div className="flex gap-1">
                  <dt>Golongan Darah:</dt>
                  <dd>{patient.golongan_darah}</dd>
                </div>
              )}
            </dl>
          ) : loading ? (
            <div className="space-y-2" aria-hidden="true">
              <SkeletonBlock className="h-4 w-2/3" />
              <SkeletonBlock className="h-4 w-1/2" />
              <SkeletonBlock className="h-4 w-3/4" />
            </div>
          ) : null}

          <div className="pt-2 flex flex-wrap gap-2">
            <PWAInstallButton variant="primary" label="Pasang Aplikasi (PWA)" showAlwaysGuide />
          </div>
        </section>

        <button
          type="button"
          onClick={onOpenPortal}
          className="w-full min-h-[48px] rounded-2xl border border-slate-200 bg-white hover:border-[#0B3D91] text-slate-800 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <ArrowUpRight className="w-4 h-4" aria-hidden="true" />
          <span>Buka Portal Rumah Sakit</span>
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="w-full min-h-[48px] rounded-2xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut className="w-4 h-4" aria-hidden="true" />
          <span>Keluar Sesi Pasien</span>
        </button>
      </div>
    </div>
  );
};
