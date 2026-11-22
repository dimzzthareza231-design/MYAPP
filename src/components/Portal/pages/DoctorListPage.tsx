import React, { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CalendarDays, RefreshCw, Search, Stethoscope } from 'lucide-react';
import { PublicPageLayout } from '../PublicPageLayout';
import { useDocumentMeta } from '../useDocumentMeta';
import { usePublicCatalog } from '../usePublicCatalog';
import { WEEK_DAYS, doctorSlug, filterDoctors } from '../publicDirectory';
import { formatDoctorSchedule } from '../portalShared';
import { DoctorAvatar } from './doctorUi';

const fieldClass =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 min-h-[44px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand';

export default function DoctorListPage() {
  useDocumentMeta(
    'Cari Dokter & Jadwal Praktik',
    'Cari dokter berdasarkan nama, poliklinik, atau hari praktik, lalu lihat profil dan buat janji temu secara online.'
  );
  const { doctors, poliklinik, status, reload } = usePublicCatalog();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') || '';
  const poliId = params.get('poli') || 'ALL';
  const day = params.get('hari') || 'ALL';

  const setParam = (key: string, value: string, emptyValue = '') => {
    const next = new URLSearchParams(params);
    if (!value || value === emptyValue) next.delete(key);
    else next.set(key, value);
    setParams(next, { replace: true, preventScrollReset: true });
  };

  // Hanya poliklinik yang memiliki dokter; bila server tidak mengirim daftar poli, turunkan dari dokter.
  const poliOptions = useMemo(() => {
    const withDoctors = new Set(doctors.map((d) => d.poli_id));
    const fromServer = poliklinik.filter((p) => withDoctors.has(p.id)).map((p) => ({ id: p.id, nama: p.nama }));
    if (fromServer.length > 0) return fromServer;
    const map = new Map<string, string>();
    doctors.forEach((d) => map.set(d.poli_id, d.poli || d.poli_id));
    return Array.from(map, ([id, nama]) => ({ id, nama })).sort((a, b) => a.nama.localeCompare(b.nama, 'id'));
  }, [doctors, poliklinik]);

  const results = useMemo(() => filterDoctors(doctors, { query, poliId, day }), [doctors, query, poliId, day]);
  const hasFilter = Boolean(query || poliId !== 'ALL' || day !== 'ALL');

  return (
    <PublicPageLayout
      width="wide"
      eyebrow="DIREKTORI DOKTER"
      title="Cari Dokter & Jadwal Praktik"
      intro="Temukan dokter berdasarkan nama, poliklinik, atau hari praktik. Jadwal dapat berubah; pastikan kembali saat mendaftar."
      breadcrumbs={[{ label: 'Cari Dokter' }]}
    >
      <form role="search" aria-label="Cari dokter" onSubmit={(e) => e.preventDefault()} className="grid grid-cols-1 md:grid-cols-12 gap-3 mb-6">
        <div className="md:col-span-6">
          <label htmlFor="doctor-q" className="block text-xs font-bold text-slate-700 mb-1">
            Nama dokter / spesialisasi
          </label>
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              id="doctor-q"
              type="search"
              value={query}
              onChange={(e) => setParam('q', e.target.value)}
              placeholder="Contoh: anak, jantung, nama dokter"
              className={`${fieldClass} pl-9`}
            />
          </div>
        </div>
        <div className="md:col-span-3">
          <label htmlFor="doctor-poli" className="block text-xs font-bold text-slate-700 mb-1">
            Poliklinik
          </label>
          <select id="doctor-poli" value={poliId} onChange={(e) => setParam('poli', e.target.value, 'ALL')} className={fieldClass}>
            <option value="ALL">Semua poliklinik</option>
            {poliOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nama}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-3">
          <label htmlFor="doctor-day" className="block text-xs font-bold text-slate-700 mb-1">
            Hari praktik
          </label>
          <select id="doctor-day" value={day} onChange={(e) => setParam('hari', e.target.value, 'ALL')} className={fieldClass}>
            <option value="ALL">Semua hari</option>
            {WEEK_DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
      </form>

      {status === 'loading' && (
        <p role="status" className="text-sm font-semibold text-slate-600 py-10 text-center">
          Memuat daftar dokter...
        </p>
      )}

      {status === 'error' && (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-center space-y-3">
          <p className="font-bold text-amber-900">Daftar dokter belum dapat dimuat.</p>
          <p className="text-sm text-amber-900">Periksa koneksi internet Anda lalu coba lagi.</p>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold px-4 min-h-[44px] cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" /> Coba lagi
          </button>
        </div>
      )}

      {status === 'ready' && (
        <>
          <p className="text-sm font-semibold text-slate-600 mb-4 tabular-nums" aria-live="polite">
            {results.length} dokter ditemukan
          </p>
          {results.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center space-y-3">
              <Stethoscope className="w-10 h-10 text-slate-400 mx-auto" aria-hidden="true" />
              {doctors.length === 0 ? (
                <>
                  <p className="font-bold text-slate-800">Jadwal dokter belum dipublikasikan.</p>
                  <p className="text-sm text-slate-600">
                    Informasi dokter akan tampil di sini setelah diperbarui oleh rumah sakit.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-slate-800">Tidak ada dokter yang cocok dengan filter Anda.</p>
                  {hasFilter && (
                    <button
                      type="button"
                      onClick={() => setParams(new URLSearchParams(), { replace: true })}
                      className="text-sm font-bold text-brand underline cursor-pointer rounded min-h-[44px]"
                    >
                      Hapus semua filter
                    </button>
                  )}
                </>
              )}
            </div>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {results.map((doc) => (
                <li key={doc.id}>
                  <Link
                    to={`/dokter/${doctorSlug(doc)}`}
                    className="group h-full flex gap-4 rounded-2xl border border-slate-200 bg-white p-4 hover:border-brand hover:shadow-md transition"
                  >
                    <DoctorAvatar doctor={doc} />
                    <div className="min-w-0 space-y-1">
                      <h2 className="font-bold text-slate-900 leading-snug group-hover:text-brand">{doc.nama}</h2>
                      <p className="text-sm text-slate-700">{[doc.spesialis, doc.subspesialis].filter(Boolean).join(' · ')}</p>
                      {doc.poli && <p className="text-xs font-semibold text-brand">{doc.poli}</p>}
                      <p className="text-xs text-slate-600 flex items-start gap-1.5">
                        <CalendarDays className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                        <span>{formatDoctorSchedule(doc)}</span>
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </PublicPageLayout>
  );
}
