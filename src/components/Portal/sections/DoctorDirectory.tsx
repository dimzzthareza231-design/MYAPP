import React from 'react';
import { Building2, Clock, Stethoscope } from 'lucide-react';
import { motion } from 'motion/react';
import { EASE_OUT_EXPO, formatDoctorSchedule, getQuotaLeft, type LiveDoctor } from '../portalShared';

interface DoctorDirectoryProps {
  categories: string[];
  selectedCategory: string;
  onSelectCategory: (cat: string) => void;
  filteredDoctors: LiveDoctor[];
  totalDoctors: number;
  catalogLoading: boolean;
  showAll: boolean;
  onToggleShowAll: () => void;
  selectedDoctorId: string | null;
  onSelectDoctor: (doc: LiveDoctor) => void;
  onResetFilters: () => void;
}

const INITIAL_VISIBLE = 6;

function doctorInitials(nama: string): string {
  return nama
    .replace(/^(dr\.|drg\.)\s*/i, '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0])
    .join('');
}

export const DoctorDirectory: React.FC<DoctorDirectoryProps> = ({
  categories,
  selectedCategory,
  onSelectCategory,
  filteredDoctors,
  totalDoctors,
  catalogLoading,
  showAll,
  onToggleShowAll,
  selectedDoctorId,
  onSelectDoctor,
  onResetFilters
}) => {
  const visibleDoctors = showAll ? filteredDoctors : filteredDoctors.slice(0, INITIAL_VISIBLE);

  return (
    <div className="lg:col-span-7 space-y-5">
      <h3 className="sr-only">Daftar jadwal dokter</h3>
      <div className="flex flex-wrap items-center justify-between gap-3">
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter kategori poliklinik">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => onSelectCategory(cat)}
                aria-pressed={selectedCategory === cat}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer min-h-[38px] whitespace-nowrap shrink-0 ${
                  selectedCategory === cat
                    ? 'bg-brand text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}
        <span className="text-xs tabular-nums font-semibold text-slate-600" aria-live="polite">
          {filteredDoctors.length} Dokter Praktik
        </span>
      </div>

      {filteredDoctors.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
          <Stethoscope className="w-10 h-10 text-slate-400 mx-auto mb-3" aria-hidden="true" />
          {totalDoctors === 0 ? (
            <>
              <p className="font-bold text-slate-800">
                {catalogLoading ? 'Memuat jadwal dokter...' : 'Jadwal dokter belum tersedia secara online'}
              </p>
              {!catalogLoading && (
                <p className="text-sm text-slate-600 mt-1">
                  Silakan coba lagi nanti atau hubungi bagian pendaftaran rumah sakit.
                </p>
              )}
            </>
          ) : (
            <>
              <p className="font-bold text-slate-800">Jadwal dokter tidak ditemukan</p>
              <p className="text-sm text-slate-600 mt-1">Coba ubah kata kunci pencarian atau pilih semua poliklinik.</p>
              <button
                type="button"
                onClick={onResetFilters}
                className="mt-4 px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold cursor-pointer"
              >
                Reset Filter
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {visibleDoctors.map((doc, idx) => {
              const isSelected = selectedDoctorId === doc.id;
              const quotaLeft = getQuotaLeft(doc);
              return (
                <motion.li
                  key={doc.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(idx * 0.04, 0.24), ease: EASE_OUT_EXPO }}
                  className={`rounded-2xl border p-5 flex flex-col justify-between bg-white transition shadow-xs hover:shadow-md ${
                    isSelected ? 'border-brand ring-2 ring-brand/15' : 'border-slate-200 hover:border-brand/40'
                  }`}
                >
                  <div>
                    <div className="flex items-start gap-3">
                      <div
                        aria-hidden="true"
                        className="w-11 h-11 rounded-xl bg-brand/10 text-brand font-extrabold text-sm flex items-center justify-center shrink-0"
                      >
                        {doctorInitials(doc.nama)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-slate-900 text-sm leading-snug">{doc.nama}</h4>
                        <p className="text-xs font-semibold text-brand mt-0.5">{doc.spesialis}</p>
                        {doc.subspesialis && <p className="text-xs text-slate-600 mt-0.5">{doc.subspesialis}</p>}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                        <span className="truncate">{[doc.poli, doc.ruangan].filter(Boolean).join(' · ')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" aria-hidden="true" />
                        <span className="tabular-nums">{formatDoctorSchedule(doc)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="text-xs">
                      <span className="font-semibold text-emerald-700">
                        {doc.status || 'Status belum tersedia'}
                      </span>
                      <span className="text-slate-400 mx-1.5" aria-hidden="true">
                        ·
                      </span>
                      <span className="tabular-nums text-slate-600">
                        {quotaLeft === null ? 'Kuota belum tersedia' : `Sisa ${quotaLeft}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => onSelectDoctor(doc)}
                      aria-pressed={isSelected}
                      aria-label={`${isSelected ? 'Dipilih' : 'Pilih dan daftar'}: ${doc.nama}`}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                        isSelected ? 'bg-brand text-white' : 'bg-slate-100 hover:bg-brand text-slate-800 hover:text-white'
                      }`}
                    >
                      {isSelected ? 'Dipilih' : 'Pilih & Daftar'}
                    </button>
                  </div>
                </motion.li>
              );
            })}
          </ul>

          {filteredDoctors.length > INITIAL_VISIBLE && (
            <div className="text-center pt-1">
              <button
                type="button"
                onClick={onToggleShowAll}
                aria-expanded={showAll}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-brand/30 bg-white text-brand font-bold text-xs hover:bg-blue-50 transition cursor-pointer"
              >
                {showAll ? 'Tampilkan Lebih Sedikit' : `Lihat Seluruh ${filteredDoctors.length} Dokter`}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
