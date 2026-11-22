import React, { useId, useMemo, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import type { PublicDoctor } from './types';
import { Modal } from './ui';
import { formatDoctorSchedule } from './JadwalScreen';
import {
  addDaysIso,
  formatShortDateId,
  localTodayIso,
  parsePracticeDays,
  upcomingPracticeDates,
  weekdayOfIso,
  WEEKDAY_NAMES_ID
} from './utils';

/** Pilihan penjamin umum; penjamin yang tercatat pada data pasien ditambahkan bila berbeda. */
const BASE_PENJAMIN_OPTIONS = ['Umum / Mandiri', 'BPJS Kesehatan', 'Asuransi Swasta / Perusahaan'];

function resolvePenjamin(patientPenjamin: string | undefined): { options: string[]; initial: string } {
  const raw = (patientPenjamin || '').trim();
  if (!raw) return { options: BASE_PENJAMIN_OPTIONS, initial: BASE_PENJAMIN_OPTIONS[0] };
  if (/^umum|mandiri$|pribadi/i.test(raw)) return { options: BASE_PENJAMIN_OPTIONS, initial: 'Umum / Mandiri' };
  if (/bpjs|jkn|kis\b/i.test(raw)) return { options: BASE_PENJAMIN_OPTIONS, initial: 'BPJS Kesehatan' };
  const existing = BASE_PENJAMIN_OPTIONS.find((o) => o.toLowerCase() === raw.toLowerCase());
  if (existing) return { options: BASE_PENJAMIN_OPTIONS, initial: existing };
  return { options: [raw, ...BASE_PENJAMIN_OPTIONS], initial: raw };
}

const BOOKING_WINDOW_DAYS = 364;

const fieldClass =
  'w-full px-3.5 min-h-[48px] rounded-xl border border-slate-300 text-base bg-white outline-none focus:border-[#0B3D91] focus:ring-2 focus:ring-[#0B3D91]/15';

export interface BookingRequest {
  tanggal: string;
  penjamin: string;
  keluhan: string;
}

const BookingForm: React.FC<{
  doctor: PublicDoctor;
  patientPenjamin?: string;
  isSubmitting: boolean;
  onSubmit: (request: BookingRequest) => void;
  onCancel: () => void;
}> = ({ doctor, patientPenjamin, isSubmitting, onSubmit, onCancel }) => {
  const dateId = useId();
  const dateHintId = useId();
  const penjaminId = useId();
  const keluhanId = useId();

  const today = useMemo(() => localTodayIso(), []);
  const maxDate = useMemo(() => addDaysIso(today, BOOKING_WINDOW_DAYS), [today]);
  const practiceDays = useMemo(() => parsePracticeDays(doctor.hari || doctor.jadwal), [doctor]);
  const quickDates = useMemo(() => upcomingPracticeDates(practiceDays, today, 6), [practiceDays, today]);
  const { options: penjaminOptions, initial: initialPenjamin } = useMemo(
    () => resolvePenjamin(patientPenjamin),
    [patientPenjamin]
  );

  const [tanggal, setTanggal] = useState<string>(() => quickDates[0] ?? today);
  const [penjamin, setPenjamin] = useState(initialPenjamin);
  const [keluhan, setKeluhan] = useState('');

  const practiceDayLabel = practiceDays
    ? Array.from(practiceDays)
        .sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7))
        .map((d) => WEEKDAY_NAMES_ID[d])
        .join(', ')
    : null;

  const dateError = useMemo(() => {
    if (!tanggal) return 'Pilih tanggal periksa.';
    if (tanggal < today) return 'Tanggal periksa tidak boleh di masa lalu.';
    if (tanggal > maxDate) return 'Pendaftaran hanya dapat dibuat hingga 1 tahun ke depan.';
    const weekday = weekdayOfIso(tanggal);
    if (practiceDays && weekday !== null && !practiceDays.has(weekday)) {
      return `Dokter tidak praktik pada hari ${WEEKDAY_NAMES_ID[weekday]}. Hari praktik: ${practiceDayLabel}.`;
    }
    return null;
  }, [tanggal, today, maxDate, practiceDays, practiceDayLabel]);

  const schedule = formatDoctorSchedule(doctor);

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-blue-50 border border-blue-100 p-3.5 text-sm space-y-1">
        <p className="font-bold text-[#0B3D91]">{doctor.poli}</p>
        <p className="font-bold text-slate-900 text-base">{doctor.nama}</p>
        <p className="font-mono text-slate-700">{schedule ?? 'Jadwal praktik belum tersedia'}</p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (dateError) return;
          onSubmit({ tanggal, penjamin, keluhan: keluhan.trim() });
        }}
        className="space-y-4"
        noValidate
      >
        <div>
          <label htmlFor={dateId} className="block text-sm font-bold text-slate-700 mb-1">
            Tanggal Periksa
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
            aria-invalid={dateError ? true : undefined}
            aria-describedby={dateHintId}
            className={fieldClass}
          />
          <p
            id={dateHintId}
            role={dateError ? 'alert' : undefined}
            className={`text-sm mt-1 ${dateError ? 'text-rose-700 font-semibold' : 'text-slate-600'}`}
          >
            {dateError ??
              (practiceDayLabel
                ? `Hari praktik: ${practiceDayLabel}.`
                : 'Hari praktik dokter belum tercatat; petugas akan mengonfirmasi jadwal Anda.')}
          </p>
        </div>
        <div>
          <label htmlFor={penjaminId} className="block text-sm font-bold text-slate-700 mb-1">
            Penjamin Biaya
          </label>
          <select id={penjaminId} value={penjamin} onChange={(e) => setPenjamin(e.target.value)} className={fieldClass}>
            {penjaminOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={keluhanId} className="block text-sm font-bold text-slate-700 mb-1">
            Keluhan Singkat <span className="font-normal text-slate-600">(opsional)</span>
          </label>
          <input
            id={keluhanId}
            type="text"
            maxLength={500}
            value={keluhan}
            onChange={(e) => setKeluhan(e.target.value)}
            placeholder="Contoh: kontrol ulang"
            className={fieldClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] rounded-xl bg-slate-100 text-slate-800 font-bold text-sm cursor-pointer"
          >
            Batal
          </button>
          <button
            type="submit"
            disabled={isSubmitting || Boolean(dateError)}
            className="min-h-[48px] rounded-xl bg-[#0B3D91] text-white font-bold text-sm cursor-pointer disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
            <span>{isSubmitting ? 'Memproses...' : 'Ambil Antrean'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};

export const BookingModal: React.FC<{
  doctor: PublicDoctor | null;
  patientPenjamin?: string;
  isSubmitting: boolean;
  onSubmit: (request: BookingRequest) => void;
  onClose: () => void;
}> = ({ doctor, patientPenjamin, isSubmitting, onSubmit, onClose }) => (
  <Modal
    open={Boolean(doctor)}
    onClose={() => {
      if (!isSubmitting) onClose();
    }}
    title="Konfirmasi Janji Temu"
    closeLabel="Tutup formulir janji temu"
  >
    {doctor && (
      <BookingForm
        key={doctor.id}
        doctor={doctor}
        patientPenjamin={patientPenjamin}
        isSubmitting={isSubmitting}
        onSubmit={onSubmit}
        onCancel={onClose}
      />
    )}
  </Modal>
);
