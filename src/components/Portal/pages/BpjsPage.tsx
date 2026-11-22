import React from 'react';
import { Link } from 'react-router-dom';
import { HOSPITAL_BPJS_CONFIG, HOSPITAL_PROFILE } from '../../../data/hospitalPublicCatalog';
import { ProseSection, PublicPageLayout } from '../PublicPageLayout';
import { useDocumentMeta } from '../useDocumentMeta';
import { SECTION_IDS } from '../portalShared';

const STEPS: Array<{ title: string; body: string }> = [
  {
    title: 'Berobat ke Faskes Tingkat Pertama (FKTP)',
    body: 'Datang ke FKTP tempat Anda terdaftar (Puskesmas, klinik pratama, atau dokter praktik perorangan) dengan membawa KTP/NIK atau kartu JKN.'
  },
  {
    title: 'Pemeriksaan & keputusan rujukan',
    body: 'Dokter FKTP memeriksa Anda. Bila diperlukan pelayanan spesialistik sesuai indikasi medis, FKTP menerbitkan rujukan (umumnya rujukan elektronik/online) ke rumah sakit.'
  },
  {
    title: 'Daftar ke rumah sakit',
    body: 'Daftar ke poliklinik tujuan sesuai rujukan, melalui pendaftaran online rumah sakit, aplikasi Mobile JKN (bila tersedia), atau loket pendaftaran.'
  },
  {
    title: 'Verifikasi & penerbitan SEP',
    body: 'Di rumah sakit, petugas memverifikasi kepesertaan dan rujukan Anda, lalu menerbitkan Surat Eligibilitas Peserta (SEP) sebagai dasar penjaminan.'
  },
  {
    title: 'Pelayanan & tindak lanjut',
    body: 'Anda menerima pelayanan sesuai indikasi medis. Bila kondisi sudah stabil, dokter dapat merujuk balik ke FKTP untuk perawatan lanjutan.'
  }
];

export default function BpjsPage() {
  useDocumentMeta(
    'Alur Pasien BPJS Kesehatan (JKN)',
    'Alur rujukan berjenjang BPJS Kesehatan dari Faskes Tingkat Pertama ke rumah sakit dan dokumen yang perlu dibawa.'
  );
  const partner = HOSPITAL_BPJS_CONFIG.isBpjsPartner;

  return (
    <PublicPageLayout
      eyebrow="JAMINAN KESEHATAN NASIONAL"
      title="Alur Pasien BPJS Kesehatan"
      intro="Pelayanan peserta JKN di rumah sakit mengikuti sistem rujukan berjenjang: dimulai dari Fasilitas Kesehatan Tingkat Pertama (FKTP) sesuai indikasi medis."
      breadcrumbs={[{ label: 'Pasien BPJS' }]}
    >
      <div className="space-y-10">
        {partner === true && (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            {HOSPITAL_PROFILE.name} melayani peserta JKN BPJS Kesehatan sesuai ketentuan kerja sama.
          </p>
        )}
        {partner === false && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            Saat ini {HOSPITAL_PROFILE.name} tidak melayani penjaminan BPJS Kesehatan untuk rawat jalan terencana.
            Pelayanan gawat darurat tetap diberikan.
          </p>
        )}
        {partner === null && (
          <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
            Untuk memastikan layanan JKN yang tersedia di rumah sakit ini, silakan hubungi bagian pendaftaran sebelum
            berkunjung.
          </p>
        )}

        <section aria-labelledby="alur-title" className="space-y-4">
          <h2 id="alur-title" className="text-lg sm:text-xl font-extrabold text-slate-900">
            Alur Rujukan Rawat Jalan
          </h2>
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="flex gap-4 rounded-2xl border border-slate-200 bg-white p-4">
                <span
                  aria-hidden="true"
                  className="w-9 h-9 rounded-full bg-brand text-white font-extrabold flex items-center justify-center shrink-0 tabular-nums"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-bold text-slate-900">{s.title}</h3>
                  <p className="text-sm text-slate-700 leading-relaxed mt-1">{s.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <ProseSection id="dokumen" title="Dokumen yang Perlu Dibawa">
          <ul>
            <li>KTP elektronik / NIK, atau kartu JKN-KIS (fisik maupun digital di aplikasi Mobile JKN).</li>
            <li>Rujukan dari FKTP yang masih berlaku (rujukan umumnya berlaku 90 hari sejak diterbitkan).</li>
            <li>Surat kontrol/rujukan internal bila Anda merupakan pasien kontrol lanjutan di rumah sakit.</li>
            <li>Dokumen pendukung lain bila diminta, mis. hasil pemeriksaan sebelumnya.</li>
          </ul>
          <p>Pastikan status kepesertaan JKN Anda aktif (iuran tidak menunggak). Status dapat dicek di aplikasi Mobile JKN atau Care Center 165.</p>
        </ProseSection>

        <ProseSection id="darurat" title="Kondisi Gawat Darurat">
          <p>
            Dalam kondisi gawat darurat, peserta JKN dapat langsung ke IGD rumah sakit tanpa rujukan dari FKTP.
            Penentuan kondisi gawat darurat dilakukan oleh dokter berdasarkan kriteria medis yang berlaku.
          </p>
        </ProseSection>

        {HOSPITAL_BPJS_CONFIG.notes.length > 0 && (
          <ProseSection id="info-rs" title="Informasi Khusus Rumah Sakit">
            <ul>
              {HOSPITAL_BPJS_CONFIG.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </ProseSection>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            to={`/#${SECTION_IDS.workspace}`}
            className="inline-flex items-center rounded-xl bg-brand hover:bg-brand-hover text-white text-sm font-bold px-4 min-h-[44px]"
          >
            Daftar Online
          </Link>
          <Link
            to="/faq"
            className="inline-flex items-center rounded-xl border border-slate-300 text-slate-800 hover:bg-slate-50 text-sm font-bold px-4 min-h-[44px]"
          >
            Tanya Jawab
          </Link>
        </div>

        <p className="text-xs text-slate-600 border-t border-slate-200 pt-4">
          Informasi umum berdasarkan ketentuan program JKN. Ketentuan dapat berubah; rujukan resmi adalah peraturan
          BPJS Kesehatan dan Kementerian Kesehatan yang berlaku.
        </p>
      </div>
    </PublicPageLayout>
  );
}
