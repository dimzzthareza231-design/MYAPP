import React, { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { CalendarClock, CalendarPlus, CalendarX2, Copy, History, RefreshCw, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import type { LoadStatus, PublicDoctor } from './types';
import { EmptyState, Modal, SkeletonList } from './ui';
import {
  addDaysIso,
  formatShortDateId,
  localTodayIso,
  parsePracticeDays,
  upcomingPracticeDates,
  weekdayOfIso,
  WEEKDAY_NAMES_ID
} from './utils';
import {
  describeVisitError,
  findVisitDoctor,
  isUpcomingVisit,
  parseVisits,
  sortVisitsNewestFirst,
  visitStatusTone,
  type PatientVisit,
  type VisitTone
} from './visitHelpers';
import { buildIcsEvent, icsFileName, parseTimeRange } from './reminders';
import { copyText, downloadTextFile } from './clientFiles';
import { formatDoctorSchedule } from './JadwalScreen';

const TONE_CLASS: Record<VisitTone, string> = {
  waiting: 'bg-sky-100 text-[#0B3D91]',
  active: 'bg-amber-100 text-amber-900',
  done: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-rose-100 text-rose-800',
  neutral: 'bg-slate-100 text-slate-700'
};

const fieldClass =
  'w-full px-3.5 min-h-[48px] rounded-xl border border-slate-300 text-base bg-white outline-none focus:border-[#0B3D91] focus:ring-2 focus:ring-[#0B3D91]/15';

const RESCHEDULE_WINDOW_DAYS = 364;

type ActionOutcome = { ok: true } | { ok: false; message: string };

/** Tambah kunjungan ke kalender perangkat melalui berkas .ics. */
export function downloadVisitIcs(visit: PatientVisit, hospitalName: string | null): void {
  const range = parseTimeRange(visit.jam_praktek);
  const ics = buildIcsEvent({
    uid: `visit-${visit.id}`,
    title: `Kontrol ${visit.poli}${visit.dokter ? ` – ${visit.dokter}` : ''}`,
    date: visit.tanggal,
    startTime: range?.start,
    endTime: range?.end,
    description: [
      visit.nomor_antrian && `Nomor antrean: ${visit.nomor_antrian}`,
      visit.kode_booking && `Kode booking: ${visit.kode_booking}`,
      visit.jam_praktek && `Jam praktik: ${visit.jam_praktek}`,
      'Bawa kartu identitas & kartu penjamin. Lakukan check-in dengan QR di aplikasi pasien.'
    ]
      .filter(Boolean)
      .join('\n'),
    location: [visit.poli, hospitalName].filter(Boolean).join(', '),
    alarmMinutesBefore: range ? 120 : 6 * 60
  });
  if (downloadTextFile(icsFileName(`kunjungan-${visit.poli}`, visit.tanggal), ics, 'text/calendar;charset=utf-8')) {
    toast.success('Berkas kalender diunduh. Buka berkas untuk menambahkannya ke kalender.');
  } else {
    toast.error('Berkas kalender tidak dapat dibuat di perangkat ini.');
  }
}

/* ────────────────────────────── Dialog batal ────────────────────────────── */

const CancelDialog: React.FC<{
  visit: PatientVisit | null;
  onClose: () => void;
  onConfirm: (visit: PatientVisit, alasan: string) => Promise<ActionOutcome>;
}> = ({ visit, onClose, onConfirm }) => {
  const reasonId = useId();
  const errorId = useId();
  const [alasan, setAlasan] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAlasan('');
    setError(null);
    setBusy(false);
  }, [visit?.id]);

  return (
    <Modal
      open={Boolean(visit)}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Batalkan Janji Temu?"
      closeLabel="Tutup dialog pembatalan"
    >
      {visit && (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            const res = await onConfirm(visit, alasan.trim());
            setBusy(false);
            if (!res.ok) setError(res.message);
          }}
        >
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 text-sm space-y-0.5">
            <p className="font-bold text-slate-900">{visit.poli}</p>
            {visit.dokter && <p className="text-slate-700">{visit.dokter}</p>}
            <p className="font-mono text-slate-700">
              {formatShortDateId(visit.tanggal)} · Antrean {visit.nomor_antrian || '—'}
            </p>
          </div>
          <p className="text-sm text-slate-700">
            Nomor antrean dan QR check-in untuk kunjungan ini akan dinonaktifkan. Tindakan ini tidak dapat dibatalkan.
          </p>
          <div>
            <label htmlFor={reasonId} className="block text-sm font-bold text-slate-700 mb-1">
              Alasan pembatalan <span className="font-normal text-slate-600">(opsional)</span>
            </label>
            <textarea
              id={reasonId}
              maxLength={200}
              rows={3}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder="Contoh: berhalangan hadir"
              className={`${fieldClass} py-2.5`}
              aria-describedby={error ? errorId : undefined}
            />
          </div>
          {error && (
            <p id={errorId} role="alert" className="text-sm font-semibold text-rose-700">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="min-h-[48px] rounded-xl bg-slate-100 text-slate-800 font-bold text-sm cursor-pointer disabled:opacity-60"
            >
              Kembali
            </button>
            <button
              type="submit"
              disabled={busy}
              className="min-h-[48px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-sm cursor-pointer disabled:opacity-60"
            >
              {busy ? 'Membatalkan...' : 'Ya, Batalkan'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
};

/* ────────────────────────────── Dialog ubah jadwal ────────────────────────────── */

const RescheduleForm: React.FC<{
  visit: PatientVisit;
  doctor: PublicDoctor | null;
  catalogStatus: LoadStatus;
  onCancel: () => void;
  onConfirm: (visit: PatientVisit, tanggal: string) => Promise<ActionOutcome>;
}> = ({ visit, doctor, catalogStatus, onCancel, onConfirm }) => {
  const dateId = useId();
  const hintId = useId();
  const errorId = useId();
  const today = useMemo(() => localTodayIso(), []);
  const maxDate = useMemo(() => addDaysIso(today, RESCHEDULE_WINDOW_DAYS), [today]);
  const practiceDays = useMemo(() => (doctor ? parsePracticeDays(doctor.hari || doctor.jadwal) : null), [doctor]);
  const quickDates = useMemo(
    () => upcomingPracticeDates(practiceDays, today, 7).filter((d) => d !== visit.tanggal).slice(0, 6),
    [practiceDays, today, visit.tanggal]
  );
  const [tanggal, setTanggal] = useState<string>(() => quickDates[0] ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const practiceDayLabel = practiceDays
    ? Array.from(practiceDays)
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((d) => WEEKDAY_NAMES_ID[d])
        .join(', ')
    : null;

  const dateError = useMemo(() => {
    if (!tanggal) return 'Pilih tanggal baru.';
    if (tanggal < today) return 'Tanggal tidak boleh di masa lalu.';
    if (tanggal > maxDate) return 'Jadwal hanya dapat diubah hingga 1 tahun ke depan.';
    if (tanggal === visit.tanggal) return 'Tanggal baru sama dengan jadwal saat ini.';
    const weekday = weekdayOfIso(tanggal);
    if (practiceDays && weekday !== null && !practiceDays.has(weekday)) {
      return `Dokter tidak praktik pada hari ${WEEKDAY_NAMES_ID[weekday]}. Hari praktik: ${practiceDayLabel}.`;
    }
    return null;
  }, [tanggal, today, maxDate, visit.tanggal, practiceDays, practiceDayLabel]);

  const schedule = doctor ? formatDoctorSchedule(doctor) : null;

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (dateError) return;
        setBusy(true);
        setError(null);
        const res = await onConfirm(visit, tanggal);
        setBusy(false);
        if (!res.ok) setError(res.message);
      }}
    >
      <div className="rounded-xl bg-blue-50 border border-blue-100 p-3.5 text-sm space-y-0.5">
        <p className="font-bold text-[#0B3D91]">{visit.poli}</p>
        {visit.dokter && <p className="font-bold text-slate-900">{visit.dokter}</p>}
        <p className="text-slate-700">
          Jadwal saat ini: <span className="font-mono">{formatShortDateId(visit.tanggal)}</span>
        </p>
        {schedule && <p className="font-mono text-slate-700">Praktik: {schedule}</p>}
      </div>

      <div>
        <label htmlFor={dateId} className="block text-sm font-bold text-slate-700 mb-1">
          Tanggal Baru
        </label>
        {practiceDays && quickDates.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1" role="group" aria-label="Tanggal praktik terdekat">
            {quickDates.map((iso) => (
              <button
                key={iso}
                type="button"
                aria-pressed={tanggal === iso}
                onClick={() => setTanggal(iso)}
                className={`shrink-0 px-3 min-h-[44px] rounded-xl border text-sm font-bold cursor-pointer ${
                  tanggal === iso
                    ? 'bg-[#0B3D91] border-[#0B3D91] text-white'
                    : 'bg-white border-slate-300 text-slate-800 hover:border-[#0B3D91]'
                }`}
              >
                {formatShortDateId(iso)}
              </button>
            ))}
          </div>
        )}
        <input
          id={dateId}
          type="date"
          required
          min={today}
          max={maxDate}
          value={tanggal}
          onChange={(e) => setTanggal(e.target.value)}
          aria-invalid={dateError && tanggal ? true : undefined}
          aria-describedby={hintId}
          className={fieldClass}
        />
        <p
          id={hintId}
          role={dateError && tanggal ? 'alert' : undefined}
          className={`text-sm mt-1 ${dateError && tanggal ? 'text-rose-700 font-semibold' : 'text-slate-600'}`}
        >
          {dateError && tanggal
            ? dateError
            : practiceDayLabel
            ? `Hari praktik: ${practiceDayLabel}. Nomor antrean baru diterbitkan untuk tanggal baru.`
            : catalogStatus === 'loading'
            ? 'Memuat jadwal praktik dokter...'
            : 'Hari praktik dokter belum tercatat; server akan memeriksa ketersediaan.'}
        </p>
      </div>

      {error && (
        <p id={errorId} role="alert" className="text-sm font-semibold text-rose-700">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="min-h-[48px] rounded-xl bg-slate-100 text-slate-800 font-bold text-sm cursor-pointer disabled:opacity-60"
        >
          Kembali
        </button>
        <button
          type="submit"
          disabled={busy || Boolean(dateError)}
          className="min-h-[48px] rounded-xl bg-[#0B3D91] text-white font-bold text-sm cursor-pointer disabled:opacity-60"
        >
          {busy ? 'Menyimpan...' : 'Simpan Jadwal'}
        </button>
      </div>
    </form>
  );
};

/* ────────────────────────────── Layar ────────────────────────────── */

export const RiwayatScreen: React.FC<{
  token: string;
  doctors: PublicDoctor[];
  catalogStatus: LoadStatus;
  hospitalName: string | null;
  onSessionExpired: () => void;
  /** Dipanggil setelah batal/ubah jadwal berhasil agar dossier (antrean aktif) ikut diperbarui. */
  onChanged: () => void;
  onGoJadwal: () => void;
}> = ({ token, doctors, catalogStatus, hospitalName, onSessionExpired, onChanged, onGoJadwal }) => {
  const [visits, setVisits] = useState<PatientVisit[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<PatientVisit | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<PatientVisit | null>(null);
  const today = localTodayIso();

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setStatus('loading');
      try {
        const res = await fetch('/api/patient/visits', { headers: { Authorization: `Bearer ${token}` } });
        const data = await res.json().catch(() => null);
        if (res.status === 401) {
          toast.error(describeVisitError('load', 401, data?.code));
          onSessionExpired();
          return;
        }
        if (!res.ok) {
          setLoadError(describeVisitError('load', res.status, data?.code, data?.message));
          if (!silent) setStatus('error');
          return;
        }
        setVisits(sortVisitsNewestFirst(parseVisits(data)));
        setLoadError(null);
        setStatus('ready');
      } catch {
        setLoadError(describeVisitError('load', null));
        if (!silent) setStatus('error');
      }
    },
    [token, onSessionExpired]
  );

  useEffect(() => {
    load();
  }, [load]);

  const runAction = useCallback(
    async (kind: 'cancel' | 'reschedule', visit: PatientVisit, body: Record<string, string>): Promise<ActionOutcome> => {
      try {
        const res = await fetch(`/api/patient/appointments/${encodeURIComponent(visit.id)}/${kind}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(body)
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data?.success) {
          setCancelTarget(null);
          setRescheduleTarget(null);
          const newQueue = data?.appointment?.nomor_antrian;
          toast.success(
            kind === 'cancel'
              ? 'Janji temu dibatalkan.'
              : `Jadwal diubah${newQueue ? `. Nomor antrean baru: ${newQueue}` : ''}.`
          );
          await load(true);
          onChanged();
          return { ok: true };
        }
        const message = describeVisitError(kind, res.status, data?.code, data?.message);
        if (res.status === 401) {
          setCancelTarget(null);
          setRescheduleTarget(null);
          toast.error(message);
          onSessionExpired();
          return { ok: true };
        }
        if (data?.code === 'APPOINTMENT_NOT_FOUND' || data?.code === 'APPOINTMENT_NOT_MODIFIABLE') {
          // Status di server sudah berubah: segarkan daftar dan dossier.
          load(true);
          onChanged();
        }
        return { ok: false, message };
      } catch {
        return { ok: false, message: describeVisitError(kind, null) };
      }
    },
    [token, load, onChanged, onSessionExpired]
  );

  const handleCopy = async (code: string) => {
    if (await copyText(code)) toast.success('Kode booking disalin.');
    else toast.error('Kode booking tidak dapat disalin. Salin secara manual.');
  };

  let body: React.ReactNode;
  if (status === 'loading') {
    body = <SkeletonList rows={3} label="Memuat riwayat kunjungan..." />;
  } else if (status === 'error') {
    body = (
      <EmptyState
        tone="error"
        icon={CalendarX2}
        title="Riwayat kunjungan belum dapat dimuat"
        description={loadError ?? undefined}
        action={
          <button
            type="button"
            onClick={() => load()}
            className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#0B3D91] text-white text-sm font-bold cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Coba Lagi
          </button>
        }
      />
    );
  } else if (visits.length === 0) {
    body = (
      <EmptyState
        icon={History}
        title="Belum ada riwayat kunjungan"
        description="Janji temu yang Anda buat melalui aplikasi atau pendaftaran akan tampil di sini."
        action={
          <button
            type="button"
            onClick={onGoJadwal}
            className="px-4 min-h-[44px] rounded-xl bg-[#0B3D91] text-white text-sm font-bold cursor-pointer"
          >
            Buat Janji Temu
          </button>
        }
      />
    );
  } else {
    body = (
      <ul className="space-y-3" aria-label="Daftar kunjungan, terbaru di atas">
        {visits.map((visit) => {
          const tone = visitStatusTone(visit.status);
          const upcoming = isUpcomingVisit(visit, today);
          return (
            <li key={visit.id} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#0B3D91]">
                    <span className="font-mono">{visit.tanggal ? formatShortDateId(visit.tanggal) : '—'}</span>
                    {visit.jam_praktek && <span className="font-mono text-slate-600"> · {visit.jam_praktek}</span>}
                  </p>
                  <h3 className="text-base font-extrabold text-slate-900 mt-0.5">{visit.poli || '—'}</h3>
                  {visit.dokter && <p className="text-sm text-slate-700">{visit.dokter}</p>}
                  <p className="text-sm text-slate-600 mt-0.5">
                    {[visit.tipe, visit.nomor_antrian && `Antrean ${visit.nomor_antrian}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-sm font-bold shrink-0 ${TONE_CLASS[tone]}`}>
                  {visit.status || 'Tidak diketahui'}
                </span>
              </div>

              {visit.kode_booking && (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 border border-slate-200 pl-3">
                  <p className="text-sm text-slate-700 min-w-0">
                    Kode booking{' '}
                    <span className="font-mono font-bold text-slate-900 tracking-wider break-all">{visit.kode_booking}</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => handleCopy(visit.kode_booking!)}
                    aria-label={`Salin kode booking ${visit.kode_booking}`}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#0B3D91] hover:bg-slate-100 cursor-pointer shrink-0"
                  >
                    <Copy className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              )}

              {(upcoming || visit.can_reschedule || visit.can_cancel) && (
                <div className="flex flex-wrap gap-2">
                  {upcoming && (
                    <button
                      type="button"
                      onClick={() => downloadVisitIcs(visit, hospitalName)}
                      className="flex-1 min-w-[9rem] min-h-[44px] px-3 rounded-xl border border-slate-300 hover:border-[#0B3D91] text-slate-800 text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-1.5"
                    >
                      <CalendarPlus className="w-4 h-4 text-[#0B3D91]" aria-hidden="true" />
                      Tambah ke Kalender
                    </button>
                  )}
                  {visit.can_reschedule && (
                    <button
                      type="button"
                      onClick={() => setRescheduleTarget(visit)}
                      className="flex-1 min-w-[9rem] min-h-[44px] px-3 rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-1.5"
                    >
                      <CalendarClock className="w-4 h-4" aria-hidden="true" />
                      Ubah Jadwal
                    </button>
                  )}
                  {visit.can_cancel && (
                    <button
                      type="button"
                      onClick={() => setCancelTarget(visit)}
                      className="flex-1 min-w-[9rem] min-h-[44px] px-3 rounded-xl border border-rose-300 text-rose-700 hover:bg-rose-50 text-sm font-bold cursor-pointer inline-flex items-center justify-center gap-1.5"
                    >
                      <XCircle className="w-4 h-4" aria-hidden="true" />
                      Batalkan
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <History className="w-5 h-5 text-[#0B3D91]" aria-hidden="true" />
            Riwayat Kunjungan
          </h2>
          <p className="text-sm text-slate-600">Janji temu terbaru tampil paling atas.</p>
        </div>
        <button
          type="button"
          onClick={() => load()}
          disabled={status === 'loading'}
          aria-label="Muat ulang riwayat kunjungan"
          className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-slate-300 text-slate-700 hover:border-[#0B3D91] cursor-pointer disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${status === 'loading' ? 'animate-spin' : ''}`} aria-hidden="true" />
        </button>
      </div>

      {body}

      <CancelDialog
        visit={cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={(visit, alasan) => runAction('cancel', visit, alasan ? { alasan } : {})}
      />

      <Modal
        open={Boolean(rescheduleTarget)}
        onClose={() => setRescheduleTarget(null)}
        title="Ubah Jadwal Kunjungan"
        closeLabel="Tutup formulir ubah jadwal"
      >
        {rescheduleTarget && (
          <RescheduleForm
            key={`${rescheduleTarget.id}-${catalogStatus}`}
            visit={rescheduleTarget}
            doctor={findVisitDoctor(rescheduleTarget, doctors)}
            catalogStatus={catalogStatus}
            onCancel={() => setRescheduleTarget(null)}
            onConfirm={(visit, tanggal) => runAction('reschedule', visit, { tanggal })}
          />
        )}
      </Modal>
    </div>
  );
};
