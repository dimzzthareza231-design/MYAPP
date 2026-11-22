import React from 'react';
import { Link } from 'react-router-dom';
import { ProseSection, PublicPageLayout } from '../PublicPageLayout';
import { useDocumentMeta } from '../useDocumentMeta';

export default function PatientRightsPage() {
  useDocumentMeta(
    'Hak & Kewajiban Pasien',
    'Hak dan kewajiban pasien menurut Undang-Undang Nomor 17 Tahun 2023 tentang Kesehatan.'
  );
  return (
    <PublicPageLayout
      eyebrow="INFORMASI PASIEN"
      title="Hak & Kewajiban Pasien"
      intro="Ringkasan hak dan kewajiban pasien berdasarkan Undang-Undang Nomor 17 Tahun 2023 tentang Kesehatan (Pasal 276 dan Pasal 277) serta peraturan pelaksanaannya."
      breadcrumbs={[{ label: 'Hak & Kewajiban Pasien' }]}
    >
      <div className="space-y-10">
        <ProseSection id="hak" title="Hak Pasien">
          <p>Pasien mempunyai hak:</p>
          <ol>
            <li>Mendapatkan informasi mengenai kesehatan dirinya.</li>
            <li>Mendapatkan penjelasan yang memadai mengenai pelayanan kesehatan yang diterimanya.</li>
            <li>Mendapatkan pelayanan kesehatan sesuai dengan kebutuhan medis, standar profesi, dan pelayanan yang bermutu.</li>
            <li>
              Menolak atau menyetujui tindakan medis, kecuali untuk tindakan medis yang diperlukan dalam rangka
              pencegahan penyakit menular dan penanggulangan kejadian luar biasa atau wabah.
            </li>
            <li>Mendapatkan akses terhadap informasi yang terdapat di dalam rekam medis.</li>
            <li>Meminta pendapat tenaga medis atau tenaga kesehatan lain.</li>
            <li>Mendapatkan hak lain sesuai dengan ketentuan peraturan perundang-undangan.</li>
          </ol>
        </ProseSection>

        <ProseSection id="kewajiban" title="Kewajiban Pasien">
          <p>Pasien mempunyai kewajiban:</p>
          <ol>
            <li>Memberikan informasi yang lengkap dan jujur tentang masalah kesehatannya.</li>
            <li>Mematuhi nasihat dan petunjuk tenaga medis dan tenaga kesehatan.</li>
            <li>Mematuhi ketentuan yang berlaku pada fasilitas pelayanan kesehatan.</li>
            <li>Memberikan imbalan jasa atas pelayanan yang diterima.</li>
          </ol>
        </ProseSection>

        <ProseSection id="terkait" title="Hak Terkait Lainnya">
          <ul>
            <li>
              Kerahasiaan kesehatan pribadi Anda dilindungi; informasi hanya dibuka dengan persetujuan Anda atau
              berdasarkan ketentuan peraturan perundang-undangan.
            </li>
            <li>
              Data pribadi Anda dilindungi menurut UU Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi — lihat{' '}
              <Link to="/kebijakan-privasi" className="font-semibold text-brand underline rounded">Kebijakan Privasi</Link>.
            </li>
            <li>
              Anda dapat menyampaikan keluhan atau masukan atas pelayanan melalui{' '}
              <Link to="/pengaduan" className="font-semibold text-brand underline rounded">kanal pengaduan</Link>.
            </li>
            <li>Dalam keadaan gawat darurat, fasilitas pelayanan kesehatan wajib memberikan pertolongan pertama tanpa meminta uang muka.</li>
          </ul>
        </ProseSection>

        <p className="text-xs text-slate-600 border-t border-slate-200 pt-4">
          Teks di atas merupakan ringkasan ketentuan perundang-undangan untuk kemudahan pasien. Bila terdapat
          perbedaan, yang berlaku adalah naskah resmi peraturan perundang-undangan.
        </p>
      </div>
    </PublicPageLayout>
  );
}
