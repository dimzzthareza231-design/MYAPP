import React from 'react';
import { HOSPITAL_LEGAL_CONFIG as L, HOSPITAL_PROFILE } from '../../../data/hospitalPublicCatalog';
import { ContactFallback, ProseSection, PublicPageLayout } from '../PublicPageLayout';
import { useDocumentMeta } from '../useDocumentMeta';
import { ContactList } from './contactUi';

export default function ComplaintPage() {
  useDocumentMeta('Pengaduan & Masukan', 'Cara menyampaikan pengaduan, keluhan, atau masukan atas pelayanan rumah sakit.');
  const rows = [
    { label: 'Telepon pengaduan', value: L.complaintPhone || HOSPITAL_PROFILE.customerServicePhone, kind: 'tel' as const },
    { label: 'WhatsApp', value: L.complaintWhatsapp || HOSPITAL_PROFILE.whatsappPhone, kind: 'wa' as const },
    { label: 'Email', value: L.complaintEmail || HOSPITAL_PROFILE.email, kind: 'email' as const },
    { label: 'Datang langsung', value: L.complaintAddress },
    { label: 'Jam layanan', value: L.complaintHours }
  ];
  const hasChannel = rows.some((r) => r.value);

  return (
    <PublicPageLayout
      eyebrow="SUARA PASIEN"
      title="Pengaduan & Masukan"
      intro="Kami menghargai setiap masukan untuk meningkatkan mutu dan keselamatan pelayanan. Pengaduan Anda diperlakukan secara rahasia."
      breadcrumbs={[{ label: 'Pengaduan' }]}
    >
      <div className="space-y-10">
        <ProseSection id="kanal" title="Kanal Pengaduan">
          {hasChannel ? <ContactList rows={rows} /> : <ContactFallback />}
          <p className="text-sm">
            Untuk kondisi gawat darurat, jangan gunakan kanal pengaduan — segera hubungi 119 atau datang ke IGD.
          </p>
        </ProseSection>

        <ProseSection id="isi" title="Informasi yang Perlu Disertakan">
          <ul>
            <li>Nama dan nomor telepon yang dapat dihubungi (boleh atas nama keluarga/wali).</li>
            <li>Tanggal, waktu, dan unit layanan terkait (mis. poliklinik, rawat inap, farmasi).</li>
            <li>Uraian kejadian secara singkat dan harapan penyelesaian Anda.</li>
            <li>Nomor rekam medis atau nomor antrean bila ada, untuk mempercepat penelusuran.</li>
          </ul>
          <p>Jangan mengirim kode verifikasi (OTP) atau kata sandi melalui kanal apa pun.</p>
        </ProseSection>

        <ProseSection id="proses" title="Proses Penanganan">
          <ol>
            <li>Pengaduan diterima dan dicatat oleh petugas.</li>
            <li>Petugas melakukan klarifikasi kepada Anda dan unit terkait.</li>
            <li>Rumah sakit menyampaikan tanggapan dan tindak lanjut kepada Anda.</li>
          </ol>
          {L.complaintResponseTime && <p>Target waktu tanggapan: {L.complaintResponseTime}.</p>}
        </ProseSection>

        <ProseSection id="eksternal" title="Kanal di Luar Rumah Sakit">
          <p>Bila penyelesaian di rumah sakit belum memuaskan, Anda dapat menyampaikan pengaduan melalui:</p>
          <ul>
            <li>Dinas Kesehatan kabupaten/kota atau provinsi setempat.</li>
            <li>
              BPJS Kesehatan (khusus peserta JKN): Care Center 165 atau aplikasi Mobile JKN.
            </li>
            <li>
              SP4N-LAPOR! (lapor.go.id) untuk pengaduan pelayanan publik, atau Ombudsman Republik Indonesia.
            </li>
            <li>
              Dugaan pelanggaran disiplin tenaga medis/tenaga kesehatan dapat diadukan kepada majelis yang berwenang
              sesuai UU Nomor 17 Tahun 2023 tentang Kesehatan.
            </li>
          </ul>
        </ProseSection>
      </div>
    </PublicPageLayout>
  );
}
