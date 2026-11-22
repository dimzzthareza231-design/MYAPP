import React from 'react';
import { Link } from 'react-router-dom';
import { HOSPITAL_FAQS } from '../../../data/hospitalPublicCatalog';
import { PublicPageLayout } from '../PublicPageLayout';
import { useDocumentMeta } from '../useDocumentMeta';

interface Faq {
  question: string;
  answer: React.ReactNode;
}

// Tanya-jawab tentang penggunaan situs ini (fitur yang memang ada), tanpa fakta RS karangan.
const PORTAL_FAQS: Faq[] = [
  {
    question: 'Bagaimana cara mendaftar ke poliklinik secara online?',
    answer: (
      <>
        Buka <Link to="/dokter" className="font-semibold text-brand underline rounded">Cari Dokter</Link>, pilih dokter,
        lalu tekan “Buat Janji”. Isi data pasien pada formulir pendaftaran, lalu kirim. Nomor antrean dan kode booking akan
        tampil setelah pendaftaran berhasil; simpan kode booking untuk mengecek antrean.
      </>
    )
  },
  {
    question: 'Bagaimana jika kuota dokter sudah penuh?',
    answer: 'Sistem akan memberi tahu bila kuota dokter pada tanggal yang dipilih sudah penuh. Silakan pilih tanggal lain atau dokter lain di poliklinik yang sama.'
  },
  {
    question: 'Apakah nomor antrean online langsung berlaku?',
    answer: 'Nomor antrean online adalah reservasi. Saat datang, lakukan verifikasi di loket/anjungan pendaftaran sesuai petunjuk petugas.'
  },
  {
    question: 'Bagaimana cara mengecek nomor antrean saya?',
    answer: (
      <>
        Gunakan menu <Link to="/#cek-antrean" className="font-semibold text-brand underline rounded">Cek Antrean</Link>{' '}
        dan masukkan kode booking (10 karakter) yang tampil setelah pendaftaran berhasil. Demi privasi, pencarian dengan
        nomor antrean, nama, atau nomor rekam medis tidak tersedia.
      </>
    )
  },
  {
    question: 'Saya pasien lama. Bagaimana cara mendaftar?',
    answer: (
      <>
        Pasien lama dapat masuk ke <Link to="/mobile" className="font-semibold text-brand underline rounded">Aplikasi Pasien</Link>{' '}
        untuk mendaftar dan melihat riwayat kunjungan.
      </>
    )
  },
  {
    question: 'Apakah saya bisa memakai BPJS Kesehatan?',
    answer: (
      <>
        Lihat <Link to="/bpjs" className="font-semibold text-brand underline rounded">alur pasien BPJS</Link> untuk
        ketentuan rujukan dan dokumen yang perlu dibawa.
      </>
    )
  },
  {
    question: 'Bagaimana jika kondisi saya darurat?',
    answer: 'Jangan menunggu pendaftaran online. Segera hubungi 119 atau datang langsung ke IGD terdekat.'
  },
  {
    question: 'Bagaimana data pribadi saya dilindungi?',
    answer: (
      <>
        Penjelasan lengkap tersedia di <Link to="/kebijakan-privasi" className="font-semibold text-brand underline rounded">Kebijakan Privasi</Link>.
      </>
    )
  }
];

const FaqList: React.FC<{ items: Faq[] }> = ({ items }) => (
  <div className="space-y-3">
    {items.map((f) => (
      <details key={f.question} className="group rounded-2xl border border-slate-200 bg-white">
        <summary className="cursor-pointer list-none px-5 py-4 font-bold text-slate-900 flex items-center justify-between gap-4 min-h-[44px] rounded-2xl">
          <span>{f.question}</span>
          <span aria-hidden="true" className="text-brand text-xl leading-none transition group-open:rotate-45">+</span>
        </summary>
        <div className="px-5 pb-5 text-sm text-slate-700 leading-relaxed">{f.answer}</div>
      </details>
    ))}
  </div>
);

export default function FaqPage() {
  useDocumentMeta('Tanya Jawab (FAQ)', 'Jawaban atas pertanyaan umum tentang pendaftaran online, antrean, BPJS, dan layanan pasien.');
  return (
    <PublicPageLayout
      eyebrow="BANTUAN"
      title="Tanya Jawab (FAQ)"
      intro={
        <>
          Belum menemukan jawaban? Sampaikan pertanyaan melalui halaman{' '}
          <Link to="/pengaduan" className="font-semibold text-brand underline rounded">Pengaduan & Masukan</Link>.
        </>
      }
      breadcrumbs={[{ label: 'FAQ' }]}
    >
      <div className="space-y-10">
        {HOSPITAL_FAQS.length > 0 && (
          <section aria-labelledby="faq-rs" className="space-y-4">
            <h2 id="faq-rs" className="text-lg sm:text-xl font-extrabold text-slate-900">
              Informasi Rumah Sakit
            </h2>
            <FaqList items={HOSPITAL_FAQS} />
          </section>
        )}
        <section aria-labelledby="faq-portal" className="space-y-4">
          <h2 id="faq-portal" className="text-lg sm:text-xl font-extrabold text-slate-900">
            Pendaftaran & Layanan Online
          </h2>
          <FaqList items={PORTAL_FAQS} />
        </section>
      </div>
    </PublicPageLayout>
  );
}
