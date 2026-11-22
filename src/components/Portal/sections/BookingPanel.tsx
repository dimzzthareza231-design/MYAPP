import React, { Suspense, lazy } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, CheckCircle2, ShieldCheck, Smartphone, Ticket } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  EASE_OUT_EXPO,
  SECTION_IDS,
  formatDoctorSchedule,
  todayIso,
  type BookingFormState,
  type BookingSuccess,
  type LiveDoctor
} from '../portalShared';

const BookingQrCode = lazy(() => import('./BookingQrCode'));

interface BookingPanelProps {
  selectedDoctor: LiveDoctor | null;
  bookingForm: BookingFormState;
  onFormChange: (patch: Partial<BookingFormState>) => void;
  isSubmitting: boolean;
  bookingSuccess: BookingSuccess | null;
  onSubmit: (e: React.FormEvent) => void;
  onCheckQueue: (nomor: string) => void;
  onReset: () => void;
}

const inputClass =
  'w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:border-brand outline-none focus-visible:ring-2 focus-visible:ring-brand/30';
const labelClass = 'block text-xs font-bold text-slate-700 mb-1';

export const BookingPanel: React.FC<BookingPanelProps> = ({
  selectedDoctor,
  bookingForm,
  onFormChange,
  isSubmitting,
  bookingSuccess,
  onSubmit,
  onCheckQueue,
  onReset
}) => (
  <div id={SECTION_IDS.bookingForm} className="lg:col-span-5 scroll-mt-24">
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden lg:sticky lg:top-24">
      <div className="bg-brand text-white px-6 py-4">
        <p className="text-xs font-bold uppercase tracking-wider text-sky-200">FORMULIR PENDAFTARAN ONLINE</p>
        <h3 className="text-lg font-extrabold mt-0.5">
          {bookingSuccess ? 'Nomor Antrean Diterbitkan' : 'Registrasi Kunjungan Poliklinik'}
        </h3>
      </div>

      <AnimatePresence mode="wait">
        {bookingSuccess ? (
          <motion.div
            key="booking-ticket-success"
            initial={{ opacity: 0, scale: 0.96, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96 }}
            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
            className="p-6 space-y-5"
            role="status"
          >
            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-1.5">
              <CheckCircle2 className="w-9 h-9 text-emerald-600 mx-auto" aria-hidden="true" />
              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Nomor Antrean Anda</p>
              <p className="text-4xl font-extrabold tabular-nums text-brand">{bookingSuccess.nomor_antrian}</p>
              <p className="text-xs text-slate-600">
                No. Rekam Medis: <strong className="tabular-nums text-slate-900">{bookingSuccess.no_rm}</strong>
              </p>
            </div>

            <dl className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
              {(
                [
                  ['Nama Pasien', bookingSuccess.nama],
                  ['Poliklinik', bookingSuccess.poli],
                  ['Dokter', bookingSuccess.dokter],
                  ['Jadwal', `${bookingSuccess.tanggal} · ${bookingSuccess.jam_praktek}`],
                  ['Penjamin', bookingSuccess.penjamin]
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt className="text-slate-600">{label}</dt>
                  <dd className="font-bold text-slate-900 text-right tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>

            {bookingSuccess.qr_value && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex flex-col items-center gap-2 text-center">
                <Suspense
                  fallback={<div className="w-36 h-36 rounded-lg bg-white animate-pulse" aria-hidden="true" />}
                >
                  <BookingQrCode value={bookingSuccess.qr_value} size={144} />
                </Suspense>
                <p className="text-xs font-bold text-blue-900">QR Reservasi</p>
                <p className="text-xs text-slate-700">
                  Tunjukkan QR ini kepada petugas saat tiba pada tanggal kunjungan untuk check-in. QR terenkripsi dan
                  hanya dapat diproses setelah petugas login.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onCheckQueue(bookingSuccess.nomor_antrian)}
                className="w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5"
              >
                <Ticket className="w-4 h-4" aria-hidden="true" />
                <span>Cek Status Antrean</span>
              </button>
              <button
                type="button"
                onClick={onReset}
                className="w-full py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Daftar Kunjungan Lain
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="booking-form-fields"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onSubmit={onSubmit}
            className="p-6 space-y-4"
            aria-label="Formulir pendaftaran online"
          >
            <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-3.5 text-xs space-y-1" aria-live="polite">
              <p className="text-xs font-bold uppercase tracking-wider text-brand">Dokter &amp; Poliklinik Dipilih</p>
              {selectedDoctor ? (
                <>
                  <p className="font-bold text-slate-900 text-sm">{selectedDoctor.nama}</p>
                  <p className="text-slate-700">
                    {selectedDoctor.poli} · <span className="tabular-nums">{formatDoctorSchedule(selectedDoctor)}</span>
                  </p>
                </>
              ) : (
                <p className="text-slate-700">Belum ada dokter dipilih. Pilih dokter dari daftar jadwal.</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100" role="group" aria-label="Status pasien">
              <button
                type="button"
                onClick={() => onFormChange({ isExistingPatient: false })}
                aria-pressed={!bookingForm.isExistingPatient}
                className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  !bookingForm.isExistingPatient ? 'bg-white text-brand shadow-xs' : 'text-slate-700'
                }`}
              >
                Pasien Baru
              </button>
              <button
                type="button"
                onClick={() => onFormChange({ isExistingPatient: true })}
                aria-pressed={bookingForm.isExistingPatient}
                className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                  bookingForm.isExistingPatient ? 'bg-white text-brand shadow-xs' : 'text-slate-700'
                }`}
              >
                Sudah Punya No. RM
              </button>
            </div>

            {bookingForm.isExistingPatient ? (
              // Pasien lama wajib masuk ke Aplikasi Pasien (sesi terverifikasi) sebelum
              // membuat janji temu dengan No. RM; server menolak No. RM tanpa sesi pasien.
              <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 space-y-3 text-sm">
                <div className="flex items-start gap-2.5 text-slate-700">
                  <ShieldCheck className="w-5 h-5 text-brand shrink-0 mt-0.5" aria-hidden="true" />
                  <p>
                    Demi keamanan rekam medis, pendaftaran untuk pasien yang sudah memiliki No. RM dilakukan setelah
                    masuk ke <strong>Aplikasi Pasien</strong>. Silakan masuk terlebih dahulu, lalu buat janji temu dari
                    aplikasi.
                  </p>
                </div>
                <Link
                  to="/mobile"
                  className="w-full py-3 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm transition flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <Smartphone className="w-4 h-4" aria-hidden="true" />
                  <span>Masuk ke Aplikasi Pasien untuk Mendaftar</span>
                </Link>
              </div>
            ) : (
              <>
                <div>
                  <label htmlFor="booking-nama" className={labelClass}>
                    Nama Lengkap Pasien <span aria-hidden="true">*</span>
                  </label>
                  <input
                    id="booking-nama"
                    type="text"
                    autoComplete="name"
                    value={bookingForm.nama}
                    onChange={(e) => onFormChange({ nama: e.target.value })}
                    placeholder="Sesuai KTP / identitas resmi"
                    className={inputClass}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="booking-tanggal-lahir" className={labelClass}>
                      Tanggal Lahir <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="booking-tanggal-lahir"
                      type="date"
                      autoComplete="bday"
                      value={bookingForm.tanggal_lahir}
                      max={todayIso()}
                      onChange={(e) => onFormChange({ tanggal_lahir: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-no-hp" className={labelClass}>
                      No. HP / WhatsApp <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="booking-no-hp"
                      type="tel"
                      inputMode="tel"
                      autoComplete="tel"
                      value={bookingForm.no_hp}
                      onChange={(e) => onFormChange({ no_hp: e.target.value })}
                      placeholder="0812xxxxxxxx"
                      className={inputClass}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="booking-tanggal" className={labelClass}>
                      Tanggal Kunjungan <span aria-hidden="true">*</span>
                    </label>
                    <input
                      id="booking-tanggal"
                      type="date"
                      value={bookingForm.tanggal}
                      min={todayIso()}
                      onChange={(e) => onFormChange({ tanggal: e.target.value })}
                      className={inputClass}
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="booking-penjamin" className={labelClass}>
                      Metode Penjamin
                    </label>
                    <select
                      id="booking-penjamin"
                      value={bookingForm.penjamin}
                      onChange={(e) => onFormChange({ penjamin: e.target.value })}
                      className={inputClass}
                    >
                      <option value="Umum / Mandiri">Umum / Mandiri</option>
                      <option value="BPJS Kesehatan">BPJS Kesehatan</option>
                      <option value="Asuransi Swasta / Perusahaan">Asuransi Swasta / Perusahaan</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label htmlFor="booking-keluhan" className={labelClass}>
                    Keluhan Utama / Tujuan Layanan
                  </label>
                  <textarea
                    id="booking-keluhan"
                    rows={2}
                    value={bookingForm.keluhan}
                    onChange={(e) => onFormChange({ keluhan: e.target.value })}
                    placeholder="Tuliskan keluhan singkat atau layanan yang diinginkan..."
                    className={inputClass}
                  />
                </div>

                <p className="text-xs text-slate-600">
                  Kolom bertanda <span aria-hidden="true">*</span>
                  <span className="sr-only">bintang</span> wajib diisi.
                </p>

                <button
                  type="submit"
                  disabled={isSubmitting || !selectedDoctor}
                  className="w-full py-3.5 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold text-sm transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-[48px]"
                >
                  <CalendarCheck className="w-4 h-4" aria-hidden="true" />
                  <span>{isSubmitting ? 'Menerbitkan Nomor Antrean...' : 'Daftar & Ambil Nomor Antrean'}</span>
                </button>
              </>
            )}
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  </div>
);
