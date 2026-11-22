import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, CalendarDays, Clock, DoorOpen, GraduationCap, Languages } from 'lucide-react';
import { PublicPageLayout } from '../PublicPageLayout';
import { useDocumentMeta } from '../useDocumentMeta';
import { usePublicCatalog } from '../usePublicCatalog';
import { findDoctorBySlug, parsePracticeDays, toStringList } from '../publicDirectory';
import { SECTION_IDS } from '../portalShared';
import { DoctorAvatar } from './doctorUi';

export default function DoctorProfilePage() {
  const { slug = '' } = useParams();
  const { doctors, status } = usePublicCatalog();
  const doctor = findDoctorBySlug(doctors, slug);

  const specialty = doctor ? [doctor.spesialis, doctor.subspesialis].filter(Boolean).join(' · ') : '';
  useDocumentMeta(
    doctor ? doctor.nama : status === 'loading' ? 'Profil Dokter' : 'Dokter tidak ditemukan',
    doctor
      ? `Profil ${doctor.nama}${specialty ? `, ${specialty}` : ''}: jadwal praktik dan pendaftaran janji temu online.`
      : 'Profil dan jadwal praktik dokter.',
    { noindex: status === 'ready' && !doctor }
  );

  if (!doctor) {
    return (
      <PublicPageLayout
        title={status === 'loading' ? 'Memuat profil dokter...' : 'Dokter tidak ditemukan'}
        breadcrumbs={[{ label: 'Cari Dokter', to: '/dokter' }, { label: 'Profil' }]}
      >
        {status === 'loading' ? (
          <p role="status" className="text-sm text-slate-600">
            Mohon tunggu sebentar.
          </p>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-slate-700">
              {status === 'error'
                ? 'Data dokter belum dapat dimuat. Periksa koneksi Anda lalu coba lagi.'
                : 'Profil dokter ini tidak tersedia atau sudah tidak praktik.'}
            </p>
            <Link
              to="/dokter"
              className="inline-flex items-center gap-2 rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold px-4 min-h-[44px]"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Kembali ke daftar dokter
            </Link>
          </div>
        )}
      </PublicPageLayout>
    );
  }

  const days = parsePracticeDays(doctor.hari);
  const languages = toStringList(doctor.bahasa);
  const education = toStringList(doctor.pendidikan);
  const bio = typeof doctor.profil === 'string' ? doctor.profil.trim() : '';
  const bookingHref = `/?dokter=${encodeURIComponent(doctor.id)}#${SECTION_IDS.bookingForm}`;

  return (
    <PublicPageLayout
      width="wide"
      eyebrow={doctor.poli || 'PROFIL DOKTER'}
      title={doctor.nama}
      intro={specialty || undefined}
      breadcrumbs={[{ label: 'Cari Dokter', to: '/dokter' }, { label: doctor.nama }]}
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 flex flex-col items-center text-center gap-4 lg:sticky lg:top-24">
            <DoctorAvatar doctor={doctor} size="lg" />
            <div>
              <p className="font-bold text-slate-900">{doctor.nama}</p>
              {specialty && <p className="text-sm text-slate-700">{specialty}</p>}
            </div>
            <Link
              to={bookingHref}
              className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-hover text-white font-bold px-4 min-h-[48px]"
            >
              <CalendarCheck className="w-5 h-5" aria-hidden="true" /> Buat Janji
            </Link>
            <p className="text-xs text-slate-600">Anda akan diarahkan ke formulir pendaftaran dengan dokter ini terpilih.</p>
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          <section aria-labelledby="jadwal-title" className="rounded-2xl border border-slate-200 bg-white p-6 space-y-4">
            <h2 id="jadwal-title" className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-brand" aria-hidden="true" /> Jadwal Praktik
            </h2>
            {days.length > 0 && (
              <ul className="flex flex-wrap gap-2" aria-label="Hari praktik">
                {days.map((d) => (
                  <li key={d} className="px-3 py-1.5 rounded-lg bg-blue-50 text-brand text-xs font-bold">
                    {d}
                  </li>
                ))}
              </ul>
            )}
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              {doctor.hari && (
                <div>
                  <dt className="text-xs font-bold text-slate-600">Hari</dt>
                  <dd className="text-slate-900">{doctor.hari}</dd>
                </div>
              )}
              {doctor.jam && (
                <div>
                  <dt className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" aria-hidden="true" /> Jam
                  </dt>
                  <dd className="text-slate-900 tabular-nums">{doctor.jam}</dd>
                </div>
              )}
              {doctor.ruangan && (
                <div>
                  <dt className="text-xs font-bold text-slate-600 flex items-center gap-1">
                    <DoorOpen className="w-3.5 h-3.5" aria-hidden="true" /> Ruang
                  </dt>
                  <dd className="text-slate-900">{doctor.ruangan}</dd>
                </div>
              )}
            </dl>
            {!doctor.hari && !doctor.jam && <p className="text-sm text-slate-600">Jadwal belum tersedia.</p>}
            <p className="text-xs text-slate-600">Jadwal dapat berubah sewaktu-waktu. Konfirmasi saat mendaftar.</p>
          </section>

          {bio && (
            <section aria-labelledby="profil-title" className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
              <h2 id="profil-title" className="text-lg font-extrabold text-slate-900">
                Profil
              </h2>
              <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{bio}</p>
            </section>
          )}

          {education.length > 0 && (
            <section aria-labelledby="pendidikan-title" className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
              <h2 id="pendidikan-title" className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <GraduationCap className="w-5 h-5 text-brand" aria-hidden="true" /> Pendidikan
              </h2>
              <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700">
                {education.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </section>
          )}

          {languages.length > 0 && (
            <section aria-labelledby="bahasa-title" className="rounded-2xl border border-slate-200 bg-white p-6 space-y-3">
              <h2 id="bahasa-title" className="text-lg font-extrabold text-slate-900 flex items-center gap-2">
                <Languages className="w-5 h-5 text-brand" aria-hidden="true" /> Bahasa
              </h2>
              <p className="text-sm text-slate-700">{languages.join(', ')}</p>
            </section>
          )}
        </div>
      </div>
    </PublicPageLayout>
  );
}
