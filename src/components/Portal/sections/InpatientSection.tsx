import React, { useState } from 'react';
import { ArrowRight, BedDouble, CheckCircle2, Clock } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SectionHeading } from './SectionHeading';
import { EASE_OUT_EXPO, SECTION_IDS, formatRupiah } from '../portalShared';
import type { InpatientRoomClass } from '../../../data/hospitalPublicCatalog';
import inpatientImg from '../../../assets/images/myitaru_inpatient_room.webp';

interface InpatientSectionProps {
  rooms: InpatientRoomClass[];
  visitingHours: { morningSession: string; eveningSession: string; rules: string[] };
  onAskAvailability: (roomName: string) => void;
}

/**
 * Kelas kamar rawat inap & jam besuk. Dirender bila salah satu data tersedia;
 * masing-masing blok disembunyikan bila datanya kosong.
 */
export const InpatientSection: React.FC<InpatientSectionProps> = ({ rooms, visitingHours, onAskAvailability }) => {
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const hasVisiting = Boolean(visitingHours.morningSession || visitingHours.eveningSession);
  if (rooms.length === 0 && !hasVisiting) return null;

  const selectedRoom = rooms.find((r) => r.id === selectedRoomId) || rooms[0];

  return (
    <section
      id={SECTION_IDS.inpatient}
      aria-labelledby="inpatient-title"
      className="py-16 sm:py-20 bg-white border-b border-slate-200 overflow-hidden scroll-mt-20"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
        <SectionHeading
          id="inpatient-title"
          className="max-w-2xl"
          eyebrow="FASILITAS RAWAT INAP"
          title="Kelas Kamar Rawat Inap & Jam Besuk"
        />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between gap-6">
            <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md aspect-[16/9]">
              <img
                src={inpatientImg}
                alt="Kamar rawat inap MYITARU"
                width={1376}
                height={768}
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
            </div>

            {hasVisiting && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-brand">JADWAL KUNJUNGAN PASIEN</p>
                    <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">Jam Besuk Rawat Inap</h3>
                  </div>
                  <Clock className="w-5 h-5 text-brand shrink-0" aria-hidden="true" />
                </div>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {visitingHours.morningSession && (
                    <div className="rounded-xl bg-white border border-slate-200 p-4">
                      <dt className="text-xs font-semibold text-slate-600">Sesi Pagi</dt>
                      <dd className="text-lg font-extrabold tabular-nums text-brand mt-0.5">
                        {visitingHours.morningSession}
                      </dd>
                    </div>
                  )}
                  {visitingHours.eveningSession && (
                    <div className="rounded-xl bg-white border border-slate-200 p-4">
                      <dt className="text-xs font-semibold text-slate-600">Sesi Sore / Malam</dt>
                      <dd className="text-lg font-extrabold tabular-nums text-brand mt-0.5">
                        {visitingHours.eveningSession}
                      </dd>
                    </div>
                  )}
                </dl>
                {visitingHours.rules.length > 0 && (
                  <ul className="space-y-1.5 text-sm text-slate-700 pt-1">
                    {visitingHours.rules.map((rule) => (
                      <li key={rule} className="flex items-start gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" aria-hidden="true" />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {selectedRoom && (
            <div className="lg:col-span-6 flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-5">
              <div className="space-y-3">
                <p id="room-picker-label" className="text-xs font-bold uppercase tracking-wider text-brand">
                  PILIH TIPE KAMAR PERAWATAN
                </p>
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby="room-picker-label">
                  {rooms.map((room) => (
                    <button
                      key={room.id}
                      type="button"
                      onClick={() => setSelectedRoomId(room.id)}
                      aria-pressed={room.id === selectedRoom.id}
                      className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                        room.id === selectedRoom.id
                          ? 'bg-brand text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {room.name}
                    </button>
                  ))}
                </div>
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedRoom.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                  className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 flex-1 flex flex-col justify-between"
                  aria-live="polite"
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <p className="text-xs font-semibold text-brand">
                          {[selectedRoom.tierLabel, selectedRoom.capacity].filter(Boolean).join(' · ')}
                        </p>
                        <h3 className="text-2xl font-extrabold text-slate-900 mt-0.5">{selectedRoom.name}</h3>
                      </div>
                      {selectedRoom.pricePerNight > 0 && (
                        <div className="text-left sm:text-right">
                          <p className="text-xs font-semibold uppercase text-slate-600">Tarif / Malam</p>
                          <p className="text-xl font-extrabold tabular-nums text-brand">
                            {formatRupiah(selectedRoom.pricePerNight)}
                          </p>
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed">{selectedRoom.summary}</p>
                    {selectedRoom.amenities.length > 0 && (
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-600 mb-2.5">
                          Fasilitas di Dalam Kamar
                        </p>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {selectedRoom.amenities.map((item) => (
                            <li key={item} className="text-xs text-slate-700 flex items-start gap-2">
                              <BedDouble className="w-4 h-4 text-brand shrink-0 mt-0.5" aria-hidden="true" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                    {selectedRoom.visitingHours && (
                      <span className="text-xs text-slate-600 font-medium">Jam besuk: {selectedRoom.visitingHours}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => onAskAvailability(selectedRoom.name)}
                      className="inline-flex items-center gap-2 bg-brand hover:bg-brand-hover text-white text-xs font-bold px-5 py-3 rounded-xl transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <span>Tanyakan Ketersediaan Kamar</span>
                      <ArrowRight className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
