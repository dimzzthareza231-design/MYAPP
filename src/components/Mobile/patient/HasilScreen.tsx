import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { FlaskConical, Pill, Stethoscope } from 'lucide-react';
import type { PatientDossierPayload, ResultSubTab } from './types';
import { EmptyState, SkeletonList } from './ui';
import { displayValue, fadeSlideTransition, fadeSlideVariants } from './utils';

const SUB_TABS: Array<{ id: ResultSubTab; label: string }> = [
  { id: 'resume', label: 'Resume & Diagnosis' },
  { id: 'lab', label: 'Lab & Radiologi' },
  { id: 'obat', label: 'Resep Obat' }
];

const ResumePanel: React.FC<{ dossier: PatientDossierPayload }> = ({ dossier }) => {
  const problemList = dossier.problemList ?? [];
  const resume = dossier.clinicalResume;
  return (
    <div className="space-y-4">
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
          </div>
        </section>
      )}
    </div>
  );
};

const LabPanel: React.FC<{ dossier: PatientDossierPayload }> = ({ dossier }) => {
  const results = dossier.labRadResults ?? [];
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
        </li>
      ))}
    </ul>
  );
};

const ObatPanel: React.FC<{ dossier: PatientDossierPayload }> = ({ dossier }) => {
  const meds = dossier.medications ?? [];
  return (
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
  );
};

export const HasilScreen: React.FC<{
  dossier: PatientDossierPayload | null;
  loading: boolean;
  subTab: ResultSubTab;
  direction: number;
  onSelectSubTab: (sub: ResultSubTab) => void;
}> = ({ dossier, loading, subTab, direction, onSelectSubTab }) => (
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
          {subTab === 'resume' && <ResumePanel dossier={dossier} />}
          {subTab === 'lab' && <LabPanel dossier={dossier} />}
          {subTab === 'obat' && <ObatPanel dossier={dossier} />}
        </motion.div>
      </AnimatePresence>
    )}
  </div>
);
