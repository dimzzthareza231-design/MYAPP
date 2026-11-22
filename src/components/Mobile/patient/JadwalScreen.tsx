import React, { useId, useMemo } from 'react';
import { CalendarX2, ChevronRight, Clock, History, RefreshCw, Search, SearchX } from 'lucide-react';
import type { LoadStatus, PublicDoctor, PublicPoliklinik } from './types';
import { EmptyState, SkeletonList } from './ui';

export const DOCTOR_PAGE_SIZE = 12;

export function formatDoctorSchedule(doc: PublicDoctor): string | null {
  const parts = [doc.hari, doc.jam].map((p) => (typeof p === 'string' ? p.trim() : '')).filter(Boolean);
  if (parts.length > 0) return parts.join(' · ');
  return doc.jadwal?.trim() || null;
}

export const JadwalScreen: React.FC<{
  doctors: PublicDoctor[];
  poliklinik: PublicPoliklinik[];
  status: LoadStatus;
  onReload: () => void;
  query: string;
  onQueryChange: (value: string) => void;
  poliId: string;
  onPoliChange: (value: string) => void;
  visibleCount: number;
  onShowMore: () => void;
  onSelectDoctor: (doc: PublicDoctor) => void;
  /** Buka Riwayat Kunjungan (batal/ubah jadwal janji temu). */
  onGoRiwayat?: () => void;
}> = ({
  doctors,
  poliklinik,
  status,
  onReload,
  query,
  onQueryChange,
  poliId,
  onPoliChange,
  visibleCount,
  onShowMore,
  onSelectDoctor,
  onGoRiwayat
}) => {
  const searchId = useId();
  const poliSelectId = useId();
  const resultsId = useId();

  const filteredDoctors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return doctors.filter((doc) => {
      const matchesQ =
        !q ||
        doc.nama.toLowerCase().includes(q) ||
        doc.spesialis.toLowerCase().includes(q) ||
        doc.poli.toLowerCase().includes(q);
      const matchesPoli = poliId === 'ALL' || doc.poli_id === poliId;
      return matchesQ && matchesPoli;
    });
  }, [doctors, query, poliId]);

  const visibleDoctors = filteredDoctors.slice(0, visibleCount);
  const remaining = filteredDoctors.length - visibleDoctors.length;
  const hasFilter = query.trim() !== '' || poliId !== 'ALL';

  let body: React.ReactNode;
  if (status === 'loading') {
    body = <SkeletonList rows={4} label="Memuat jadwal dokter..." className="md:grid md:grid-cols-2 md:gap-4 md:space-y-0" />;
  } else if (status === 'error') {
    body = (
      <EmptyState
        tone="error"
        icon={CalendarX2}
        title="Jadwal dokter belum dapat dimuat"
        description="Periksa koneksi internet Anda, lalu coba lagi."
        action={
          <button
            type="button"
            onClick={onReload}
            className="inline-flex items-center gap-2 px-4 min-h-[44px] rounded-xl bg-[#0B3D91] text-white text-sm font-bold cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
            Coba Lagi
          </button>
        }
      />
    );
  } else if (doctors.length === 0) {
    body = (
      <EmptyState
        icon={CalendarX2}
        title="Belum ada jadwal dokter yang dipublikasikan"
        description="Silakan hubungi bagian pendaftaran rumah sakit untuk membuat janji temu."
      />
    );
  } else if (filteredDoctors.length === 0) {
    body = (
      <EmptyState
        icon={SearchX}
        title="Dokter tidak ditemukan"
        description={
          query.trim()
            ? `Tidak ada dokter yang cocok dengan "${query.trim()}"${poliId !== 'ALL' ? ' di poliklinik terpilih' : ''}.`
            : 'Tidak ada dokter terjadwal di poliklinik terpilih.'
        }
        action={
          hasFilter ? (
            <button
              type="button"
              onClick={() => {
                onQueryChange('');
                onPoliChange('ALL');
              }}
              className="px-4 min-h-[44px] rounded-xl border border-slate-300 text-slate-800 text-sm font-bold cursor-pointer hover:border-[#0B3D91]"
            >
              Hapus Filter
            </button>
          ) : undefined
        }
      />
    );
  } else {
    body = (
      <>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleDoctors.map((doc) => {
            const schedule = formatDoctorSchedule(doc);
            return (
              <li
                key={doc.id}
                className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-bold text-[#0B3D91]">{doc.poli}</p>
                  <h3 className="font-bold text-slate-900 text-base mt-0.5">{doc.nama}</h3>
                  {doc.spesialis && <p className="text-sm text-slate-600 mt-0.5">{doc.spesialis}</p>}
                  <p className="text-sm text-slate-600 font-mono tabular-nums mt-2 flex items-center gap-1.5">
                    <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
                    {schedule ?? <span className="font-sans italic">Jadwal praktik belum tersedia</span>}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSelectDoctor(doc)}
                  aria-label={`Pilih ${doc.nama} dan ambil antrean`}
                  className="w-full min-h-[44px] rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white text-sm font-bold cursor-pointer"
                >
                  Pilih &amp; Ambil Antrean
                </button>
              </li>
            );
          })}
        </ul>
        {remaining > 0 && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={onShowMore}
              className="px-5 min-h-[44px] rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-bold cursor-pointer hover:border-[#0B3D91]"
            >
              Tampilkan lebih banyak ({remaining} dokter lagi)
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {onGoRiwayat && (
        <button
          type="button"
          onClick={onGoRiwayat}
          className="w-full bg-white rounded-2xl border border-slate-200 hover:border-[#0B3D91] p-4 min-h-[44px] flex items-center gap-3 text-left cursor-pointer"
        >
          <History className="w-5 h-5 text-[#0B3D91] shrink-0" aria-hidden="true" />
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-bold text-slate-900">Riwayat &amp; Janji Temu Saya</span>
            <span className="block text-sm text-slate-600">Lihat, ubah jadwal, atau batalkan janji temu.</span>
          </span>
          <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
        </button>
      )}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3">
        <h2 className="text-base font-extrabold text-slate-900">Cari Jadwal Dokter &amp; Ambil Antrean</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative">
            <label htmlFor={searchId} className="sr-only">
              Cari nama dokter atau spesialisasi
            </label>
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              id={searchId}
              type="search"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Cari nama dokter atau spesialisasi..."
              aria-controls={resultsId}
              disabled={status !== 'ready' || doctors.length === 0}
              className="w-full pl-10 pr-4 min-h-[44px] rounded-xl border border-slate-300 text-base outline-none focus:border-[#0B3D91] disabled:bg-slate-50"
            />
          </div>
          <div>
            <label htmlFor={poliSelectId} className="sr-only">
              Filter poliklinik
            </label>
            <select
              id={poliSelectId}
              value={poliId}
              onChange={(e) => onPoliChange(e.target.value)}
              aria-controls={resultsId}
              disabled={status !== 'ready' || poliklinik.length === 0}
              className="w-full px-3.5 min-h-[44px] rounded-xl border border-slate-300 text-base bg-white outline-none focus:border-[#0B3D91] disabled:bg-slate-50"
            >
              <option value="ALL">Semua Poliklinik</option>
              {poliklinik.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nama}
                </option>
              ))}
            </select>
          </div>
        </div>
        {status === 'ready' && doctors.length > 0 && (
          <p className="text-sm text-slate-600" aria-live="polite">
            {filteredDoctors.length} dokter ditemukan
          </p>
        )}
      </div>

      <div id={resultsId} className="space-y-4">
        {body}
      </div>
    </div>
  );
};
