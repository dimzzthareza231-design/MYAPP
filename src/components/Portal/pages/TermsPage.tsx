import React from 'react';
import { Link } from 'react-router-dom';
import { HOSPITAL_LEGAL_CONFIG as L, HOSPITAL_PROFILE } from '../../../data/hospitalPublicCatalog';
import { ProseSection, PublicPageLayout, TableOfContents } from '../PublicPageLayout';
import { useDocumentMeta } from '../useDocumentMeta';

const SECTIONS = [
  { id: 'ruang-lingkup', title: 'Ruang Lingkup' },
  { id: 'darurat', title: 'Bukan untuk Keadaan Darurat' },
  { id: 'pendaftaran', title: 'Pendaftaran Online & Antrean' },
  { id: 'data', title: 'Kebenaran Data' },
  { id: 'akun', title: 'Akun Aplikasi Pasien' },
  { id: 'konten', title: 'Konten Informasi & Edukasi' },
  { id: 'larangan', title: 'Larangan Penggunaan' },
  { id: 'hki', title: 'Hak Kekayaan Intelektual' },
  { id: 'tanggung-jawab', title: 'Batasan Tanggung Jawab' },
  { id: 'perubahan', title: 'Perubahan & Hukum yang Berlaku' }
];

export default function TermsPage() {
  useDocumentMeta('Syarat Layanan', 'Syarat dan ketentuan penggunaan situs web publik, pendaftaran online, dan Aplikasi Pasien.');
  const operator = L.legalEntityName || HOSPITAL_PROFILE.name;
  return (
    <PublicPageLayout
      eyebrow="KETENTUAN"
      title="Syarat Layanan"
      intro={
        <>
          Dengan menggunakan situs web dan Aplikasi Pasien yang dikelola {operator}, Anda menyetujui syarat berikut.
          {L.termsEffectiveDate && <> Berlaku sejak {L.termsEffectiveDate}.</>}
        </>
      }
      breadcrumbs={[{ label: 'Syarat Layanan' }]}
    >
      <TableOfContents items={SECTIONS} />
      <div className="space-y-10">
        <ProseSection id="ruang-lingkup" title="1. Ruang Lingkup">
          <p>
            Syarat ini berlaku untuk penggunaan situs web publik (jadwal dokter, pendaftaran online, cek antrean,
            informasi layanan) dan Aplikasi Pasien. Pemrosesan data pribadi diatur dalam{' '}
            <Link to="/kebijakan-privasi" className="font-semibold text-brand underline rounded">Kebijakan Privasi</Link>.
          </p>
        </ProseSection>
        <ProseSection id="darurat" title="2. Bukan untuk Keadaan Darurat">
          <p>
            Layanan online tidak ditujukan untuk kondisi gawat darurat. Dalam keadaan darurat, segera hubungi 119
            atau datang langsung ke Instalasi Gawat Darurat (IGD) terdekat.
          </p>
        </ProseSection>
        <ProseSection id="pendaftaran" title="3. Pendaftaran Online & Antrean">
          <ul>
            <li>Nomor antrean online merupakan reservasi dan tetap memerlukan verifikasi di loket/anjungan saat kedatangan.</li>
            <li>Jadwal dokter dapat berubah karena keadaan tertentu; rumah sakit akan berupaya memberi tahu Anda.</li>
            <li>Estimasi waktu tunggu bersifat perkiraan dan dapat berubah sesuai kondisi pelayanan.</li>
            <li>Pasien penjamin BPJS Kesehatan wajib memenuhi ketentuan rujukan dan administrasi JKN yang berlaku.</li>
          </ul>
        </ProseSection>
        <ProseSection id="data" title="4. Kebenaran Data">
          <p>
            Anda bertanggung jawab atas kebenaran data yang diisi. Pendaftaran atas nama orang lain hanya boleh
            dilakukan oleh keluarga atau wali yang berwenang.
          </p>
        </ProseSection>
        <ProseSection id="akun" title="5. Akun Aplikasi Pasien">
          <p>
            Jaga kerahasiaan kode verifikasi dan perangkat Anda. Segera hubungi rumah sakit bila Anda menduga akun
            Anda digunakan tanpa izin.
          </p>
        </ProseSection>
        <ProseSection id="konten" title="6. Konten Informasi & Edukasi">
          <p>
            Artikel dan informasi kesehatan bersifat edukasi umum dan bukan pengganti diagnosis atau saran medis dari
            tenaga medis yang memeriksa Anda secara langsung.
          </p>
        </ProseSection>
        <ProseSection id="larangan" title="7. Larangan Penggunaan">
          <ul>
            <li>Membuat pendaftaran palsu, berulang, atau untuk menimbun kuota antrean.</li>
            <li>Mencoba mengakses data pasien lain atau bagian sistem yang tidak diperuntukkan bagi Anda.</li>
            <li>Mengganggu, membebani, atau merusak sistem, termasuk dengan program otomatis.</li>
          </ul>
          <p>Pelanggaran dapat mengakibatkan pembatalan pendaftaran dan tindakan sesuai hukum yang berlaku.</p>
        </ProseSection>
        <ProseSection id="hki" title="8. Hak Kekayaan Intelektual">
          <p>Konten, logo, dan perangkat lunak pada layanan ini dilindungi hak kekayaan intelektual pemiliknya masing-masing.</p>
        </ProseSection>
        <ProseSection id="tanggung-jawab" title="9. Batasan Tanggung Jawab">
          <p>
            Kami berupaya menjaga layanan online tetap tersedia dan akurat, namun gangguan teknis dapat terjadi. Sejauh
            diizinkan hukum, kami tidak bertanggung jawab atas kerugian akibat gangguan di luar kendali wajar kami.
            Hal ini tidak mengurangi hak Anda sebagai pasien menurut peraturan perundang-undangan.
          </p>
        </ProseSection>
        <ProseSection id="perubahan" title="10. Perubahan & Hukum yang Berlaku">
          <p>
            Syarat ini dapat diperbarui dan versi terbaru selalu tersedia di halaman ini. Syarat ini tunduk pada hukum
            Negara Republik Indonesia. Pertanyaan dan keberatan dapat disampaikan melalui halaman{' '}
            <Link to="/pengaduan" className="font-semibold text-brand underline rounded">Pengaduan</Link>.
          </p>
        </ProseSection>
      </div>
    </PublicPageLayout>
  );
}
