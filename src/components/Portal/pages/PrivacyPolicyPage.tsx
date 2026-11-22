import React from 'react';
import { Link } from 'react-router-dom';
import { HOSPITAL_LEGAL_CONFIG as L, HOSPITAL_PROFILE, PUBLIC_PRIVACY_SETTINGS } from '../../../data/hospitalPublicCatalog';
import { ContactFallback, ProseSection, PublicPageLayout, TableOfContents } from '../PublicPageLayout';
import { useDocumentMeta } from '../useDocumentMeta';
import { ContactList } from './contactUi';

const SECTIONS = [
  { id: 'pengendali', title: 'Pengendali Data Pribadi' },
  { id: 'data-dikumpulkan', title: 'Data Pribadi yang Kami Kumpulkan' },
  { id: 'tujuan', title: 'Tujuan Pemrosesan' },
  { id: 'dasar-hukum', title: 'Dasar Pemrosesan' },
  { id: 'pengungkapan', title: 'Pengungkapan kepada Pihak Lain' },
  { id: 'retensi', title: 'Masa Penyimpanan (Retensi)' },
  { id: 'keamanan', title: 'Keamanan & Kegagalan Pelindungan Data' },
  { id: 'perangkat', title: 'Cookie & Penyimpanan di Perangkat' },
  { id: 'anak', title: 'Data Pribadi Anak' },
  { id: 'hak', title: 'Hak Anda sebagai Subjek Data Pribadi' },
  { id: 'permintaan', title: 'Cara Mengajukan Permintaan' },
  { id: 'kontak-dpo', title: 'Kontak Pejabat Pelindungan Data Pribadi' },
  { id: 'perubahan', title: 'Perubahan Kebijakan' }
];

export default function PrivacyPolicyPage() {
  useDocumentMeta(
    'Kebijakan Privasi',
    'Kebijakan privasi dan pelindungan data pribadi pasien sesuai UU No. 27 Tahun 2022 tentang Pelindungan Data Pribadi.'
  );
  const controller = L.legalEntityName || HOSPITAL_PROFILE.name;
  const dpoRows = [
    { label: 'Nama / Jabatan', value: L.dpoName },
    { label: 'Email', value: L.dpoEmail, kind: 'email' as const },
    { label: 'Telepon', value: L.dpoPhone, kind: 'tel' as const },
    { label: 'Alamat surat', value: L.dpoAddress }
  ];
  const hasDpo = dpoRows.some((r) => r.value);

  return (
    <PublicPageLayout
      eyebrow="PELINDUNGAN DATA PRIBADI"
      title="Kebijakan Privasi"
      intro={
        <>
          Kebijakan ini menjelaskan bagaimana {controller} memproses data pribadi Anda melalui situs web publik dan
          Aplikasi Pasien, mengacu pada Undang-Undang Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP)
          serta ketentuan kerahasiaan dan rekam medis di bidang kesehatan.
          {L.privacyEffectiveDate && <> Berlaku sejak {L.privacyEffectiveDate}.</>}
        </>
      }
      breadcrumbs={[{ label: 'Kebijakan Privasi' }]}
    >
      <TableOfContents items={SECTIONS} />
      <div className="space-y-10">
        <ProseSection id="pengendali" title="1. Pengendali Data Pribadi">
          <p>
            Pengendali data pribadi adalah <strong>{controller}</strong>
            {HOSPITAL_PROFILE.address && <>, beralamat di {HOSPITAL_PROFILE.address}</>}. Pengendali menentukan
            tujuan dan cara pemrosesan data pribadi Anda dan bertanggung jawab atas pelindungannya.
          </p>
        </ProseSection>

        <ProseSection id="data-dikumpulkan" title="2. Data Pribadi yang Kami Kumpulkan">
          <p>
            <strong>Data pribadi yang bersifat umum</strong>, antara lain:
          </p>
          <ul>
            <li>Nama lengkap, tanggal lahir, dan nomor telepon yang Anda isi saat mendaftar online.</li>
            <li>Pilihan poliklinik, dokter, tanggal kunjungan, dan jenis penjamin (umum, BPJS, atau asuransi).</li>
            <li>Data akun Aplikasi Pasien (mis. nomor rekam medis yang ditautkan dan data verifikasi masuk).</li>
            <li>Data teknis yang lazim tercatat oleh server (mis. alamat IP, jenis peramban, waktu akses) untuk keamanan.</li>
          </ul>
          <p>
            <strong>Data pribadi yang bersifat spesifik</strong> (Pasal 4 UU PDP), yaitu data dan informasi kesehatan:
            keluhan yang Anda tuliskan saat pendaftaran, serta rekam medis, hasil pemeriksaan, dan data pengobatan
            yang dibuat dalam pelayanan kesehatan.
          </p>
        </ProseSection>

        <ProseSection id="tujuan" title="3. Tujuan Pemrosesan">
          <ul>
            <li>Memproses pendaftaran, menerbitkan nomor antrean, dan menyelenggarakan pelayanan kesehatan.</li>
            <li>Menyusun dan menyimpan rekam medis sesuai kewajiban peraturan perundang-undangan.</li>
            <li>Mengurus klaim pembiayaan kepada penjamin yang Anda pilih (mis. BPJS Kesehatan atau asuransi).</li>
            <li>Menghubungi Anda terkait jadwal, perubahan layanan, atau hasil pemeriksaan.</li>
            <li>Menjaga keamanan sistem, mencegah penyalahgunaan, dan menangani pengaduan.</li>
          </ul>
          <p>Kami tidak menjual data pribadi Anda dan tidak menggunakannya untuk iklan pihak ketiga.</p>
        </ProseSection>

        <ProseSection id="dasar-hukum" title="4. Dasar Pemrosesan">
          <p>Sesuai Pasal 20 UU PDP, kami memproses data pribadi berdasarkan satu atau lebih dasar berikut:</p>
          <ul>
            <li>Persetujuan yang sah dan eksplisit dari Anda untuk tujuan tertentu.</li>
            <li>Pemenuhan perjanjian pelayanan kesehatan dengan Anda.</li>
            <li>Pemenuhan kewajiban hukum, termasuk kewajiban penyelenggaraan rekam medis.</li>
            <li>Pelindungan kepentingan vital Anda, misalnya dalam kondisi gawat darurat.</li>
            <li>Pelaksanaan tugas dalam rangka kepentingan umum atau kewenangan berdasarkan peraturan.</li>
            <li>Kepentingan yang sah lainnya dengan memperhatikan hak Anda sebagai subjek data.</li>
          </ul>
        </ProseSection>

        <ProseSection id="pengungkapan" title="5. Pengungkapan kepada Pihak Lain">
          <p>Data pribadi hanya diungkapkan sebatas yang diperlukan dan sesuai ketentuan, yaitu kepada:</p>
          <ul>
            <li>Penjamin pembiayaan yang Anda pilih (mis. BPJS Kesehatan atau perusahaan asuransi) untuk klaim.</li>
            <li>Kementerian Kesehatan dan instansi berwenang sesuai kewajiban pelaporan dan integrasi rekam medis.</li>
            <li>Fasilitas pelayanan kesehatan lain dalam rangka rujukan atau kesinambungan perawatan Anda.</li>
            <li>Aparat penegak hukum atau pihak lain bila diwajibkan oleh peraturan perundang-undangan.</li>
          </ul>
          {L.dataProcessors.length > 0 && (
            <>
              <p>Pemroses data yang bertindak atas nama kami:</p>
              <ul>
                {L.dataProcessors.map((p) => (
                  <li key={p.name}>
                    <strong>{p.name}</strong> — {p.purpose}
                  </li>
                ))}
              </ul>
            </>
          )}
        </ProseSection>

        <ProseSection id="retensi" title="6. Masa Penyimpanan (Retensi)">
          <ul>
            <li>
              Rekam medis disimpan sesuai ketentuan peraturan di bidang kesehatan (Peraturan Menteri Kesehatan Nomor 24
              Tahun 2022 tentang Rekam Medis menetapkan penyimpanan paling singkat 25 tahun sejak kunjungan terakhir),
              kemudian dimusnahkan atau dikelola sesuai ketentuan.
            </li>
            {L.nonMedicalRetention && <li>Data non-rekam-medis: {L.nonMedicalRetention}.</li>}
            <li>Setelah masa retensi berakhir, data dimusnahkan atau dianonimkan.</li>
          </ul>
        </ProseSection>

        <ProseSection id="keamanan" title="7. Keamanan & Kegagalan Pelindungan Data">
          <p>
            Kami menerapkan langkah teknis dan organisasi untuk melindungi data pribadi dari akses, pengungkapan,
            pengubahan, atau penghapusan yang tidak sah, termasuk pembatasan akses berdasarkan kewenangan petugas.
          </p>
          <p>
            Apabila terjadi kegagalan pelindungan data pribadi, kami akan menyampaikan pemberitahuan tertulis kepada
            Anda dan lembaga yang berwenang paling lambat 3 x 24 jam sesuai Pasal 46 UU PDP.
          </p>
        </ProseSection>

        <ProseSection id="perangkat" title="8. Cookie & Penyimpanan di Perangkat">
          {PUBLIC_PRIVACY_SETTINGS.usesAnalytics ? (
            <p>
              Situs ini memakai analitik hanya bila Anda menyetujuinya melalui pemberitahuan privasi. Anda dapat
              mengubah pilihan dengan menghapus data situs di peramban Anda.
            </p>
          ) : (
            <p>Situs ini tidak memakai cookie iklan atau pelacak analitik pihak ketiga.</p>
          )}
          <p>
            Penyimpanan lokal peramban (localStorage) dipakai untuk fungsi yang Anda gunakan, misalnya menyimpan
            riwayat tiket antrean terakhir di perangkat Anda dan menandai bahwa pemberitahuan privasi telah dibaca.
            Data tersebut tetap di perangkat Anda dan dapat dihapus melalui pengaturan peramban.
          </p>
          <p>Peta Google Maps hanya dimuat setelah Anda memilih untuk menampilkannya.</p>
        </ProseSection>

        <ProseSection id="anak" title="9. Data Pribadi Anak">
          <p>
            Pemrosesan data pribadi anak dilakukan dengan persetujuan orang tua atau wali anak, sesuai Pasal 25 UU PDP.
          </p>
        </ProseSection>

        <ProseSection id="hak" title="10. Hak Anda sebagai Subjek Data Pribadi">
          <p>Berdasarkan Pasal 5 sampai Pasal 13 UU PDP, Anda berhak untuk:</p>
          <ol>
            <li>Mendapatkan informasi tentang identitas pengendali, dasar, tujuan, dan akuntabilitas pemrosesan.</li>
            <li>Melengkapi, memperbarui, dan/atau memperbaiki kesalahan dan ketidakakuratan data pribadi Anda.</li>
            <li>Mendapatkan akses dan memperoleh salinan data pribadi Anda.</li>
            <li>Mengakhiri pemrosesan, menghapus, dan/atau memusnahkan data pribadi Anda.</li>
            <li>Menarik kembali persetujuan pemrosesan yang telah Anda berikan.</li>
            <li>Mengajukan keberatan atas keputusan yang hanya didasarkan pada pemrosesan otomatis.</li>
            <li>Menunda atau membatasi pemrosesan secara proporsional dengan tujuan pemrosesan.</li>
            <li>Menggugat dan menerima ganti rugi atas pelanggaran pemrosesan data pribadi Anda.</li>
            <li>Mendapatkan dan/atau menggunakan data pribadi Anda dalam bentuk yang umum dan dapat dibaca sistem.</li>
          </ol>
          <p>
            Sebagian hak dapat dibatasi sesuai Pasal 15 UU PDP, misalnya kewajiban hukum untuk tetap menyimpan rekam
            medis selama masa retensi. Bila demikian, kami akan menjelaskan alasannya kepada Anda.
          </p>
        </ProseSection>

        <ProseSection id="permintaan" title="11. Cara Mengajukan Permintaan">
          <ol>
            <li>Sampaikan permintaan melalui kontak pada bagian berikut, sebutkan hak yang ingin Anda gunakan.</li>
            <li>Kami akan memverifikasi identitas Anda (atau wali/kuasa yang sah) sebelum memproses permintaan.</li>
            <li>
              Permintaan ditanggapi dalam jangka waktu yang ditetapkan UU PDP (untuk sebagian hak, paling lambat 3 x 24
              jam sejak permintaan diterima).
            </li>
          </ol>
          <p>
            Untuk salinan rekam medis, Anda juga dapat menghubungi unit rekam medis rumah sakit. Pengaduan umum dapat
            disampaikan melalui halaman <Link to="/pengaduan" className="font-semibold text-brand underline rounded">Pengaduan</Link>.
          </p>
        </ProseSection>

        <ProseSection id="kontak-dpo" title="12. Kontak Pejabat Pelindungan Data Pribadi">
          {hasDpo ? <ContactList rows={dpoRows} /> : <ContactFallback />}
        </ProseSection>

        <ProseSection id="perubahan" title="13. Perubahan Kebijakan">
          <p>
            Kebijakan ini dapat diperbarui sewaktu-waktu. Perubahan material akan diumumkan di halaman ini
            {L.privacyEffectiveDate ? ' beserta tanggal berlakunya' : ''}.
          </p>
        </ProseSection>
      </div>
    </PublicPageLayout>
  );
}
