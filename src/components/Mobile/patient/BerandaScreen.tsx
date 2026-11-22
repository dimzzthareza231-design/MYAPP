import React from 'react';
import { AlertTriangle, BellOff, BellRing, CalendarPlus, ChevronRight, FlaskConical, HeartPulse, History, Receipt, Sparkles } from 'lucide-react';
import type { PatientDossierPayload } from './types';
import type { PatientNotificationsState } from './usePatientNotifications';
import { SkeletonBlock } from './ui';
import { displayValue, hasBillingData } from './utils';

const VitalTile: React.FC<{ label: string; value: string; unit: string; accent?: boolean }> = ({
  label,
  value,
  unit,
  accent
}) => (
  <div className="rounded-xl bg-slate-50 border border-slate-200/70 p-3">
    <p className="text-sm text-slate-600">{label}</p>
    <p className={`text-lg font-extrabold font-mono tabular-nums mt-0.5 ${accent ? 'text-emerald-700' : 'text-slate-900'}`}>
      {value}
      {value !== '—' && <span className="text-sm font-normal ml-1">{unit}</span>}
    </p>
  </div>
);

const BerandaSkeleton: React.FC = () => (
  <div role="status" aria-live="polite" aria-busy="true" className="grid grid-cols-1 lg:grid-cols-12 gap-5">
    <span className="sr-only">Memuat data pasien...</span>
    <div className="lg:col-span-7 rounded-3xl bg-white border border-slate-200 p-6 space-y-4">
      <SkeletonBlock className="h-4 w-40" />
      <SkeletonBlock className="h-6 w-56" />
      <SkeletonBlock className="h-20 w-full" />
    </div>
    <div className="lg:col-span-5 space-y-4">
      <SkeletonBlock className="h-28 w-full rounded-2xl" />
      <div className="grid grid-cols-2 gap-3">
        <SkeletonBlock className="h-24 rounded-2xl" />
        <SkeletonBlock className="h-24 rounded-2xl" />
      </div>
    </div>
  </div>
);

export const BerandaScreen: React.FC<{
  dossier: PatientDossierPayload | null;
  loading: boolean;
  notif: PatientNotificationsState;
  onOpenQr: () => void;
  onGoJadwal: () => void;
  onGoLab: () => void;
  onGoTagihan: () => void;
  onOpenNotifications: () => void;
  /** Buka Riwayat Kunjungan. */
  onGoRiwayat?: () => void;
}> = ({ dossier, loading, notif, onOpenQr, onGoJadwal, onGoLab, onGoTagihan, onOpenNotifications, onGoRiwayat }) => {
  if (!dossier) return loading ? <BerandaSkeleton /> : null;

  const activeQueues = dossier.activeQueues ?? [];
  const allergies = dossier.allergies ?? [];
  const labCount = (dossier.labRadResults ?? []).length;
  const primaryQueue = activeQueues[0];
  const billingPresent = hasBillingData(dossier.billing);
  const { fcmMode, fcmCapability, sseConnected, fcmSyncing, notifications } = notif;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      <div className="lg:col-span-7 space-y-4">
        {primaryQueue ? (
          <div className="rounded-3xl bg-gradient-to-br from-[#0B3D91] to-[#1E3163] text-white p-6 shadow-lg space-y-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-wider text-sky-200">Antrean Aktif</p>
                <h2 className="text-lg font-extrabold mt-0.5">{primaryQueue.poli}</h2>
                {primaryQueue.dokter && <p className="text-sm text-blue-100 mt-0.5">{primaryQueue.dokter}</p>}
              </div>
              {primaryQueue.status && (
                <span className="px-3 py-1 rounded-full bg-white/15 text-sm font-bold text-white whitespace-nowrap">
                  {primaryQueue.status}
                </span>
              )}
            </div>

            <dl className="grid grid-cols-3 gap-3 bg-white/10 rounded-2xl p-4 border border-white/10">
              <div>
                <dt className="text-sm text-blue-100">Nomor Anda</dt>
                <dd className="text-2xl sm:text-3xl font-extrabold font-mono tabular-nums mt-0.5">
                  {displayValue(primaryQueue.nomor_antrian)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-blue-100">Sedang Dilayani</dt>
                <dd className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-sky-300 mt-0.5">
                  {displayValue(primaryQueue.poli_sedang_dipanggil)}
                </dd>
              </div>
              <div>
                <dt className="text-sm text-blue-100">Estimasi Tunggu</dt>
                <dd className="text-xl sm:text-2xl font-bold font-mono tabular-nums mt-0.5">
                  {Number.isFinite(primaryQueue.estimasi_menit) ? `${primaryQueue.estimasi_menit} mnt` : '—'}
                </dd>
              </div>
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-blue-100">
              <span className="font-mono tabular-nums">
                {[primaryQueue.tanggal, primaryQueue.jam_praktek].filter(Boolean).join(' · ')}
              </span>
              <button
                type="button"
                onClick={onOpenQr}
                className="font-bold text-white underline underline-offset-4 cursor-pointer min-h-[44px] px-1"
              >
                Tunjukkan QR Check-In
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl bg-white border border-slate-200 p-6 text-center space-y-3">
            <CalendarPlus className="w-10 h-10 text-[#0B3D91] mx-auto" aria-hidden="true" />
            <h2 className="font-bold text-slate-900">Belum Ada Antrean Aktif</h2>
            <p className="text-sm text-slate-600">
              Jadwalkan konsultasi dokter spesialis langsung dari menu Jadwal &amp; Daftar.
            </p>
            <button
              type="button"
              onClick={onGoJadwal}
              className="px-5 min-h-[44px] rounded-xl bg-[#0B3D91] text-white text-sm font-bold cursor-pointer"
            >
              Cari Dokter &amp; Daftar Poli
            </button>
          </div>
        )}

        {activeQueues.length > 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600">Daftar Kunjungan Lainnya</h3>
            <ul>
              {activeQueues.slice(1).map((apt) => (
                <li
                  key={apt.id}
                  className="flex items-center justify-between gap-3 py-2 border-t border-slate-100 first:border-t-0"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">{apt.poli}</p>
                    <p className="text-sm text-slate-600">
                      {[apt.dokter, apt.tanggal].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="font-mono tabular-nums text-sm font-extrabold text-[#0B3D91]">{apt.nomor_antrian}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {dossier.inpatientStay && (
          <div className="rounded-2xl bg-indigo-50 border border-indigo-200 p-4 space-y-1.5">
            <p className="text-sm font-bold uppercase tracking-wider text-indigo-800">Status Rawat Inap Aktif</p>
            <p className="text-sm font-bold text-slate-900">
              {dossier.inpatientStay.bangsal} · {dossier.inpatientStay.ruangan} ({dossier.inpatientStay.nomor_bed})
            </p>
            <p className="text-sm text-slate-600">
              Kelas {dossier.inpatientStay.kelas} · Masuk{' '}
              <span className="font-mono">{displayValue(dossier.inpatientStay.tanggal_masuk)}</span>
            </p>
          </div>
        )}
      </div>

      <div className="lg:col-span-5 space-y-4">
        {allergies.length > 0 && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-4 space-y-2">
            <p className="text-sm font-extrabold uppercase tracking-wider text-rose-700 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              Peringatan Alergi Tercatat
            </p>
            <ul className="space-y-1">
              {allergies.map((al, i) => (
                <li key={`${al.allergen}-${i}`} className="text-sm text-rose-900 font-semibold">
                  • {al.allergen}
                  {al.reaction ? ` (${al.reaction})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {dossier.vitalsLatest && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <HeartPulse className="w-4 h-4 text-[#0B3D91]" aria-hidden="true" />
                <span>Tanda Vital Terakhir</span>
              </h3>
              {dossier.vitalsLatest.date && (
                <span className="text-sm font-mono text-slate-600">{dossier.vitalsLatest.date}</span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 gap-3">
              <VitalTile label="Tekanan Darah" value={displayValue(dossier.vitalsLatest.bp)} unit="mmHg" />
              <VitalTile label="Nadi" value={displayValue(dossier.vitalsLatest.hr)} unit="x/mnt" />
              <VitalTile label="Suhu Tubuh" value={displayValue(dossier.vitalsLatest.temp)} unit="°C" />
              <VitalTile label="Saturasi O₂" value={displayValue(dossier.vitalsLatest.spo2)} unit="%" accent />
            </div>
          </div>
        )}

        {onGoRiwayat && (
          <button
            type="button"
            onClick={onGoRiwayat}
            className="w-full bg-white hover:border-[#0B3D91] border border-slate-200 rounded-2xl p-4 min-h-[44px] flex items-center gap-3 text-left transition cursor-pointer"
          >
            <History className="w-5 h-5 text-[#0B3D91] shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-slate-900">Riwayat Kunjungan</span>
              <span className="block text-sm text-slate-600">Ubah jadwal, batalkan, atau tambahkan ke kalender.</span>
            </span>
            <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
          </button>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={onGoLab}
            className="bg-white hover:border-[#0B3D91] border border-slate-200 rounded-2xl p-4 text-left transition cursor-pointer min-h-[44px]"
          >
            <FlaskConical className="w-5 h-5 text-[#0B3D91] mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-900">Hasil Lab &amp; Rad</p>
            <p className="text-sm text-slate-600 font-mono mt-0.5">
              {labCount > 0 ? `${labCount} Laporan` : 'Belum ada'}
            </p>
          </button>
          <button
            type="button"
            onClick={onGoTagihan}
            className="bg-white hover:border-[#0B3D91] border border-slate-200 rounded-2xl p-4 text-left transition cursor-pointer min-h-[44px]"
          >
            <Receipt className="w-5 h-5 text-[#0B3D91] mb-2" aria-hidden="true" />
            <p className="text-sm font-bold text-slate-900">Status Tagihan</p>
            <p className={`text-sm font-semibold mt-0.5 ${billingPresent ? 'text-emerald-700' : 'text-slate-600'}`}>
              {billingPresent ? dossier.billing.status : 'Belum ada tagihan'}
            </p>
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <div
                className={`p-2 rounded-xl shrink-0 ${
                  fcmMode !== 'inactive' || sseConnected ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-[#0B3D91]'
                }`}
              >
                {fcmCapability?.permission === 'denied' ? (
                  <BellOff className="w-4 h-4 text-rose-600" aria-hidden="true" />
                ) : (
                  <BellRing className="w-4 h-4" aria-hidden="true" />
                )}
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">Notifikasi Antrean &amp; Hasil Lab</h3>
                <p className="text-sm text-slate-600 mt-0.5 leading-relaxed">
                  Terima peringatan saat nomor antrean dipanggil poli atau hasil laboratorium selesai divalidasi.
                </p>
              </div>
            </div>
            <span
              className={`px-2.5 py-1 rounded-full text-xs font-bold shrink-0 ${
                fcmMode === 'fcm_web_push'
                  ? 'bg-emerald-100 text-emerald-800'
                  : sseConnected
                  ? 'bg-sky-100 text-[#0B3D91]'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {fcmMode === 'fcm_web_push' ? 'Notifikasi aktif' : sseConnected ? 'Diperbarui otomatis' : 'Belum aktif'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {fcmCapability?.permission !== 'granted' || fcmMode === 'inactive' ? (
              <button
                type="button"
                disabled={fcmSyncing}
                onClick={notif.enableNotifications}
                className="flex-1 min-h-[44px] px-3.5 rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white text-sm font-bold cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                <BellRing className="w-4 h-4" aria-hidden="true" />
                <span>{fcmSyncing ? 'Mengaktifkan notifikasi...' : 'Aktifkan Notifikasi'}</span>
              </button>
            ) : null}
            <button
              type="button"
              onClick={onOpenNotifications}
              className="min-h-[44px] px-3.5 rounded-xl border border-slate-300 hover:border-[#0B3D91] bg-slate-50 text-slate-800 text-sm font-bold cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-4 h-4 text-[#0B3D91]" aria-hidden="true" />
              <span>Kelola Notifikasi ({notifications.length})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
