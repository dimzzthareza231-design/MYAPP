/**
 * Ekspor PDF hasil medis di sisi klien (jsPDF dimuat dinamis hanya saat dibutuhkan).
 * Isi dokumen hanya berasal dari dossier server; field kosong ditulis "—".
 */
import type { PatientDossierPayload } from './types';

export interface PdfField {
  label: string;
  value: string;
}

export interface PdfSection {
  heading: string;
  fields?: PdfField[];
  paragraphs?: string[];
  bullets?: string[];
}

export interface PdfDocumentModel {
  title: string;
  hospitalName: string | null;
  identity: PdfField[];
  sections: PdfSection[];
  generatedAt: Date;
  fileName: string;
}

type Dossier = PatientDossierPayload;
type LabItem = Dossier['labRadResults'][number];

function v(value: unknown): string {
  if (value === null || value === undefined) return '—';
  const text = String(value).trim();
  return text || '—';
}

function patientIdentity(dossier: Dossier): PdfField[] {
  const p = dossier.patient;
  return [
    { label: 'Nama', value: v(p?.nama) },
    { label: 'No. RM', value: v(p?.no_rm) },
    { label: 'Tanggal Lahir', value: v(p?.tanggal_lahir) },
    { label: 'Jenis Kelamin', value: p?.jenis_kelamin === 'L' ? 'Laki-laki' : p?.jenis_kelamin === 'P' ? 'Perempuan' : '—' },
    { label: 'NIK', value: v(p?.nik_masked) },
    { label: 'Penjamin', value: v(p?.penjamin) }
  ];
}

function safeName(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'dokumen';
}

function stamp(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}

function labSection(item: LabItem): PdfSection {
  return {
    heading: `${v(item.jenis)} — ${v(item.pemeriksaan)}`,
    fields: [
      { label: 'Tanggal', value: v(item.tanggal) },
      { label: 'Status', value: v(item.status) },
      { label: 'DPJP / Pengirim', value: v(item.dokter) },
      ...(item.loinc ? [{ label: 'Kode LOINC', value: item.loinc }] : [])
    ],
    paragraphs: [v(item.hasil)]
  };
}

/** Model PDF untuk satu atau beberapa hasil lab/radiologi. */
export function buildLabPdfModel(
  dossier: Dossier,
  items: LabItem[],
  hospitalName: string | null,
  now = new Date()
): PdfDocumentModel {
  const single = items.length === 1 ? items[0] : null;
  return {
    title: single ? `Hasil ${v(single.jenis)}` : 'Hasil Laboratorium & Radiologi',
    hospitalName,
    identity: patientIdentity(dossier),
    sections: items.map(labSection),
    generatedAt: now,
    fileName: `${single ? safeName(`hasil-${single.pemeriksaan}`) : 'hasil-lab-radiologi'}-${dossier.patient?.no_rm ?? 'pasien'}-${stamp(now)}.pdf`
  };
}

/** Model PDF resume medis + daftar diagnosis. */
export function buildResumePdfModel(dossier: Dossier, hospitalName: string | null, now = new Date()): PdfDocumentModel {
  const sections: PdfSection[] = [];
  const problems = dossier.problemList ?? [];
  sections.push({
    heading: 'Daftar Diagnosis',
    bullets:
      problems.length > 0
        ? problems.map((p) =>
            [p.nama, p.kode_icd10 && `(${p.kode_icd10})`, p.status && `— ${p.status}`].filter(Boolean).join(' ')
          )
        : ['Belum ada catatan diagnosis.']
  });
  const r = dossier.clinicalResume;
  if (r) {
    sections.push({
      heading: 'Resume Medis',
      fields: [
        { label: 'No. Resume', value: v(r.no_resume) },
        { label: 'Layanan', value: v(r.layanan) },
        { label: 'Unit', value: v(r.unit_pelayanan) },
        { label: 'DPJP', value: [r.dokter_dpjp, r.spesialisasi_dpjp].filter(Boolean).join(', ') || '—' },
        { label: 'Tanggal Masuk', value: v(r.tgl_masuk) },
        { label: 'Tanggal Keluar', value: v(r.tgl_keluar) },
        { label: 'Kondisi Pulang', value: v(r.kondisi_pulang) }
      ]
    });
    sections.push({
      heading: 'Anamnesis & Pemeriksaan',
      fields: [
        { label: 'Keluhan Utama', value: v(r.keluhan_utama) },
        { label: 'Riwayat Penyakit Sekarang', value: v(r.riwayat_penyakit_sekarang) },
        { label: 'Riwayat Alergi', value: v(r.riwayat_alergi) },
        { label: 'Pemeriksaan Fisik', value: v(r.pemeriksaan_fisik) }
      ]
    });
    const diagnoses = [
      r.diagnosis_primer?.nama && `Primer: ${r.diagnosis_primer.nama}${r.diagnosis_primer.kode_icd10 ? ` (${r.diagnosis_primer.kode_icd10})` : ''}`,
      ...(r.diagnosis_sekunder ?? []).map((d) => `Sekunder: ${d.nama}${d.kode_icd10 ? ` (${d.kode_icd10})` : ''}`)
    ].filter((x): x is string => Boolean(x));
    if (diagnoses.length > 0) sections.push({ heading: 'Diagnosis Resume', bullets: diagnoses });
    const procedures = (r.tindakan_prosedur ?? []).map((t) => `${t.nama}${t.kode_icd9 ? ` (${t.kode_icd9})` : ''}`);
    if (procedures.length > 0) sections.push({ heading: 'Tindakan / Prosedur', bullets: procedures });
    const meds = (r.obat_pulang ?? []).map((o) =>
      [o.nama_obat, o.dosis, o.frekuensi, o.aturan_pakai, o.jumlah && `Jumlah: ${o.jumlah}`].filter(Boolean).join(' · ')
    );
    if (meds.length > 0) sections.push({ heading: 'Obat Pulang', bullets: meds });
    sections.push({
      heading: 'Instruksi & Kontrol',
      fields: [
        { label: 'Edukasi', value: v(r.instruksi_edukasi) },
        { label: 'Jadwal Kontrol', value: v(r.jadwal_kontrol) },
        { label: 'Status TTE', value: v(r.tte_status) }
      ]
    });
  }
  return {
    title: 'Resume Medis',
    hospitalName,
    identity: patientIdentity(dossier),
    sections,
    generatedAt: now,
    fileName: `resume-medis-${dossier.patient?.no_rm ?? 'pasien'}-${stamp(now)}.pdf`
  };
}

/** Merender model ke PDF A4 dan memicu unduhan. */
export async function downloadPdf(model: PdfDocumentModel): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 16;
  const contentW = pageW - margin * 2;
  let y = margin;

  const ensure = (needed: number) => {
    if (y + needed > pageH - margin - 8) {
      doc.addPage();
      y = margin;
    }
  };
  const write = (text: string, opts: { size?: number; bold?: boolean; indent?: number; gap?: number } = {}) => {
    const size = opts.size ?? 10;
    const indent = opts.indent ?? 0;
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    const lineH = size * 0.45;
    const lines = doc.splitTextToSize(text, contentW - indent) as string[];
    for (const line of lines) {
      ensure(lineH);
      doc.text(line, margin + indent, y);
      y += lineH;
    }
    y += opts.gap ?? 1;
  };

  if (model.hospitalName) write(model.hospitalName, { size: 14, bold: true });
  write(model.title, { size: 12, bold: true, gap: 2 });
  doc.setDrawColor(11, 61, 145);
  doc.line(margin, y, pageW - margin, y);
  y += 5;

  write('Identitas Pasien', { size: 11, bold: true });
  for (const f of model.identity) write(`${f.label}: ${f.value}`, { indent: 2, gap: 0.5 });
  y += 3;

  for (const section of model.sections) {
    ensure(12);
    write(section.heading, { size: 11, bold: true, gap: 1.5 });
    for (const f of section.fields ?? []) write(`${f.label}: ${f.value}`, { indent: 2, gap: 0.5 });
    for (const p of section.paragraphs ?? []) write(p, { indent: 2, gap: 1 });
    for (const b of section.bullets ?? []) write(`• ${b}`, { indent: 2, gap: 0.5 });
    y += 3;
  }

  const footer = `Dicetak dari Aplikasi Pasien MYITARU pada ${model.generatedAt.toLocaleString('id-ID')}. Salinan informasi, bukan pengganti dokumen resmi bertanda tangan.`;
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100);
    const lines = doc.splitTextToSize(footer, contentW - 20) as string[];
    doc.text(lines, margin, pageH - 10);
    doc.text(`${i}/${pages}`, pageW - margin, pageH - 10, { align: 'right' });
    doc.setTextColor(0);
  }
  doc.save(model.fileName);
}
