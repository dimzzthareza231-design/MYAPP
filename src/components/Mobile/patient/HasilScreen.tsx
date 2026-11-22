import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CalendarPlus, Download, FlaskConical, Pill, Stethoscope } from 'lucide-react';
import toast from 'react-hot-toast';
import type { PatientDossierPayload, ResultSubTab } from './types';
import { EmptyState, SkeletonList } from './ui';
import { displayValue, fadeSlideTransition, fadeSlideVariants, formatShortDateId, localTodayIso } from './utils';
import { buildLabPdfModel, buildResumePdfModel, downloadPdf, type PdfDocumentModel } from './pdfExport';
import { buildIcsEvent, icsFileName, parseExplicitDate } from './reminders';
import { downloadTextFile } from './clientFiles';
import { buildLabTrends } from './labTrend';
import { LabTrendCard } from './LabTrendCard';
import { MedicineReminderPanel, type ReminderMedSource } from './MedicineReminders';

/** Tombol unduh PDF dengan status sibuk; jsPDF dimuat hanya saat ditekan. */
const PdfButton: React.FC<{ label: string; ariaLabel?: string; build: () => PdfDocumentModel; compact?: boolean }> = ({
  label,
  ariaLabel,
  build,
  compact
}) => {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      aria-label={ariaLabel}
      onClick={async () => {
        setBusy(true);
        try {
          await downloadPdf(build());
        } catch {
          toast.error('PDF tidak dapat dibuat di perangkat ini. Coba lagi.');
        } finally {
          setBusy(false);
        }
      }}
      className={`min-h-[44px] px-3 rounded-xl border border-slate-300 hover:border-[#0B3D91] bg-white text-slate-800 text-sm font-bold cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-1.5 ${
        compact ? '' : 'w-full sm:w-auto'
      }`}
    >
      <Download className="w-4 h-4 text-[#0B3D91]" aria-hidden="true" />
      {busy ? 'Menyiapkan PDF...' : label}
    </button>
  );
};

function downloadControlIcs(controlDate: string, resume: NonNullable<PatientDossierPayload['clinicalResume']>, hospitalName: string | null) {
  const ics = buildIcsEvent({
    uid: `kontrol-${resume.id || resume.no_resume}-${controlDate}`,
    title: `Kontrol ${resume.unit_pelayanan || 'ke dokter'}`,
    date: controlDate,
    description: [
      resume.dokter_dpjp && `DPJP: ${resume.dokter_dpjp}`,
      resume.jadwal_kontrol && `Catatan dokter: ${resume.jadwal_kontrol}`,
      'Buat janji temu melalui aplikasi pasien sebelum datang.'
    ]
      .filter(Boolean)
      .join('\n'),
    location: [resume.unit_pelayanan, hospitalName].filter(Boolean).join(', '),
    alarmMinutesBefore: 24 * 60
  });
  if (downloadTextFile(icsFileName('kontrol', controlDate), ics, 'text/calendar;charset=utf-8')) {
    toast.success('Berkas kalender diunduh. Buka berkas untuk menambahkannya ke kalender.');
  } else {
    toast.error('Berkas kalender tidak dapat dibuat di perangkat ini.');
  }
}

const SUB_TABS: Array<{ id: ResultSubTab; label: string }> = [
  { id: 'resume', label: 'Resume & Diagnosis' },
  { id: 'lab', label: 'Lab & Radiologi' },
  { id: 'obat', label: 'Resep Obat' }
];

const ResumePanel: React.FC<{ dossier: PatientDossierPayload; hospitalName: string | null }> = ({ dossier, hospitalName }) => {
  const problemList = dossier.problemList ?? [];
  const resume = dossier.clinicalResume;
  const controlDate = parseExplicitDate(resume?.jadwal_kontrol);
  const showControlCalendar = Boolean(resume && controlDate && controlDate >= localTodayIso());
  return (
    <div className="space-y-4">
      {(resume || problemList.length > 0) && (
        <div className="flex justify-end">
          <PdfButton label="Unduh Resume (PDF)" build={() => buildResumePdfModel(dossier, hospitalName)} />
        </div>
      )}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" aria-labelledby="diagnosis-heading">
        <h3 id="diagnosis-heading" className="text-base font-extrabold text-slate-900 flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-[#0B3D91]" aria-hidden="true" />
          <span>Daftar Diagnosis &amp; Riwayat Klinis</span>
        </h3>
        {problemList.length === 0 ? (
          <EmptyState
            icon={Stethoscope}
            title="Belum ada catatan diagnosis"
            description="Diagnosis akan tampil di sini setelah dicatat oleh dokter pada kunjungan Anda."
          />
        ) : (
          <ul className="space-y-2">
            {problemList.map((pr, idx) => (
              <li
                key={`${pr.kode_icd10}-${idx}`}
                className="rounded-xl bg-slate-50 border border-slate-200/70 p-3 flex items-center justify-between gap-3"
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">{pr.nama}</p>
                  <p className="text-sm text-slate-600">
                    {[pr.severity && `Derajat: ${pr.severity}`, pr.status && `Status: ${pr.status}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                {pr.kode_icd10 && (
                  <span className="font-mono text-sm font-bold text-[#0B3D91] shrink-0">{pr.kode_icd10}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {resume && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3 text-sm">
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              {resume.no_resume && <p className="text-sm font-bold text-[#0B3D91]">{resume.no_resume}</p>}
              <h4 className="font-bold text-slate-900">{displayValue(resume.unit_pelayanan)}</h4>
            </div>
            {resume.kondisi_pulang && (
              <span className="text-sm font-semibold text-emerald-700">{resume.kondisi_pulang}</span>
            )}
          </div>
          <div>
            <p className="text-sm font-bold text-slate-600">Keluhan &amp; Pemeriksaan</p>
            <p className="text-sm text-slate-800 mt-1 leading-relaxed">
              {[resume.keluhan_utama, resume.pemeriksaan_fisik].filter(Boolean).join('. ') || '—'}
            </p>
          </div>
          <div>
            <p className="text-sm font-bold text-slate-600">Anjuran &amp; Jadwal Kontrol</p>
            <p className="text-sm text-slate-800 mt-1 leading-relaxed">
              {displayValue(resume.instruksi_edukasi)}
              {resume.jadwal_kontrol && (
                <>
                  {' '}
                  · Kontrol: <strong>{resume.jadwal_kontrol}</strong>
                </>
              )}
            </p>
            {showControlCalendar && controlDate && (
              <button
                type="button"
                onClick={() => downloadControlIcs(controlDate, resume, hospitalName)}
                className="mt-2 min-h-[44px] px-3 rounded-xl border border-slate-300 hover:border-[#0B3D91] text-slate-800 text-sm font-bold cursor-pointer inline-flex items-center gap-1.5"
              >
                <CalendarPlus className="w-4 h-4 text-[#0B3D91]" aria-hidden="true" />
                Tambah Kontrol {formatShortDateId(controlDate)} ke Kalender
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

const LabPanel: React.FC<{ dossier: PatientDossierPayload; hospitalName: string | null }> = ({ dossier, hospitalName }) => {
  const results = dossier.labRadResults ?? [];
  const trends = useMemo(() => buildLabTrends(results.filter((r) => /lab/i.test(r.jenis || 'lab'))), [results]);
  if (results.length === 0) {
    return (
      <EmptyState
        icon={FlaskConical}
        title="Belum ada hasil laboratorium atau radiologi"
        description="Hasil akan muncul di sini setelah divalidasi oleh dokter. Aktifkan notifikasi agar Anda diberi tahu saat hasil siap."
      />
    );
  }
  return (
    <div className="space-y-4">
    {results.length > 1 && (
      <div className="flex justify-end">
        <PdfButton label="Unduh Semua Hasil (PDF)" build={() => buildLabPdfModel(dossier, results, hospitalName)} />
      </div>
    )}
    <LabTrendCard trends={trends} />
    <ul className="space-y-3">
      {results.map((item) => (
        <li key={item.id} className="bg-white rounded-2xl border border-slate-200 p-5 space-y-2.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-[#0B3D91]">
                {item.jenis}
                {item.tanggal && (
                  <>
                    {' '}
                    · <span className="font-mono">{item.tanggal}</span>
                  </>
                )}
              </p>
              <h4 className="text-base font-extrabold text-slate-900 mt-0.5">{item.pemeriksaan}</h4>
            </div>
            {item.status && <span className="text-sm font-bold text-emerald-700 shrink-0">{item.status}</span>}
          </div>
          <p className="text-sm text-slate-800 leading-relaxed bg-slate-50 p-3 rounded-xl border border-slate-100 whitespace-pre-line">
            {displayValue(item.hasil)}
          </p>
          {item.dokter && <p className="text-sm text-slate-600">DPJP / Pengirim: {item.dokter}</p>}
          <PdfButton
            compact
            label="Unduh PDF"
            ariaLabel={`Unduh PDF hasil ${item.pemeriksaan}`}
            build={() => buildLabPdfModel(dossier, [item], hospitalName)}
          />
        </li>
      ))}
    </ul>
    </div>
  );
};

function reminderSources(dossier: PatientDossierPayload): ReminderMedSource[] {
  const seen = new Set<string>();
  const out: ReminderMedSource[] = [];
  const push = (name: string, dose: string, instruction: string) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ name: name.trim(), dose: dose || '', instruction: instruction || '' });
  };
  for (const m of dossier.medications ?? []) {
    if (/henti|stop|selesai/i.test(m.status || '')) continue;
    push(m.name, m.dose, m.frequency);
  }
  for (const o of dossier.clinicalResume?.obat_pulang ?? []) {
    push(o.nama_obat, o.dosis, [o.frekuensi, o.aturan_pakai].filter(Boolean).join(', '));
  }
  return out;
}

const ObatPanel: React.FC<{ dossier: PatientDossierPayload }> = ({ dossier }) => {
  const meds = dossier.medications ?? [];
  const sources = useMemo(() => reminderSources(dossier), [dossier]);
  const owner = dossier.patient?.no_rm ?? '';
  return (
    <div className="space-y-4">
    <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3" aria-labelledby="obat-heading">
      <h3 id="obat-heading" className="text-base font-extrabold text-slate-900 flex items-center gap-2">
        <Pill className="w-4 h-4 text-[#0B3D91]" aria-hidden="true" />
        <span>Terapi &amp; Resep Obat Aktif</span>
      </h3>
      {meds.length === 0 ? (
        <EmptyState
          icon={Pill}
          title="Belum ada resep obat"
          description="Resep dari dokter akan tampil di sini setelah diterbitkan oleh farmasi."
        />
      ) : (
        <ul className="space-y-2">
          {meds.map((med, idx) => (
            <li
              key={`${med.name}-${idx}`}
              className="rounded-xl bg-slate-50 border border-slate-200/70 p-3.5 flex items-center justify-between gap-3"
            >
              <div>
                <p className="text-sm font-bold text-slate-900">{med.name}</p>
                <p className="text-sm text-slate-600 mt-0.5">{[med.dose, med.frequency].filter(Boolean).join(' · ')}</p>
              </div>
              {med.status && <span className="text-sm font-bold text-emerald-700">{med.status}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
    {owner && <MedicineReminderPanel owner={owner} meds={sources} />}
    </div>
  );
};

export const HasilScreen: React.FC<{
  dossier: PatientDossierPayload | null;
  loading: boolean;
  subTab: ResultSubTab;
  direction: number;
  onSelectSubTab: (sub: ResultSubTab) => void;
  /** Nama rumah sakit dari katalog publik (untuk kop PDF); null bila tidak dikonfigurasi. */
  hospitalName?: string | null;
}> = ({ dossier, loading, subTab, direction, onSelectSubTab, hospitalName = null }) => (
  <div className="space-y-4">
    <div role="group" aria-label="Jenis hasil medis" className="grid grid-cols-3 gap-2 p-1 rounded-2xl bg-slate-200/70">
      {SUB_TABS.map((st) => (
        <button
          key={st.id}
          type="button"
          aria-pressed={subTab === st.id}
          onClick={() => onSelectSubTab(st.id)}
          className={`py-2 px-2 rounded-xl text-sm font-bold leading-tight transition cursor-pointer min-h-[44px] ${
            subTab === st.id ? 'bg-white text-[#0B3D91] shadow-xs' : 'text-slate-700'
          }`}
        >
          {st.label}
        </button>
      ))}
    </div>

    {!dossier ? (
      loading ? (
        <SkeletonList rows={3} label="Memuat hasil medis..." />
      ) : null
    ) : (
      <AnimatePresence mode="wait" custom={direction} initial={false}>
        <motion.div
          key={subTab}
          custom={direction}
          variants={fadeSlideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={fadeSlideTransition}
        >
          {subTab === 'resume' && <ResumePanel dossier={dossier} hospitalName={hospitalName} />}
          {subTab === 'lab' && <LabPanel dossier={dossier} hospitalName={hospitalName} />}
          {subTab === 'obat' && <ObatPanel dossier={dossier} />}
        </motion.div>
      </AnimatePresence>
    )}
  </div>
);
