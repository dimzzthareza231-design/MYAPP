import React from 'react';
import { AlertCircle, CalendarCheck, RefreshCw, Ticket } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { SectionHeading } from './SectionHeading';
import { EASE_OUT_EXPO, SECTION_IDS, type WorkspaceMode } from '../portalShared';

interface PatientWorkspaceProps {
  activeMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
  catalogLoading: boolean;
  catalogError: string | null;
  onRetry: () => void;
  /** Konten mode "daftar" (direktori dokter + formulir). */
  bookingContent: React.ReactNode;
  /** Konten mode "antrean". */
  queueContent: React.ReactNode;
}

const MODES: Array<{ mode: WorkspaceMode; label: string; icon: React.ElementType }> = [
  { mode: 'daftar', label: 'Pendaftaran Online', icon: CalendarCheck },
  { mode: 'antrean', label: 'Cek Nomor Antrean', icon: Ticket }
];

export const PatientWorkspace: React.FC<PatientWorkspaceProps> = ({
  activeMode,
  onModeChange,
  catalogLoading,
  catalogError,
  onRetry,
  bookingContent,
  queueContent
}) => (
  <section
    id={SECTION_IDS.workspace}
    aria-labelledby="workspace-title"
    className="py-12 sm:py-16 bg-slate-50 border-b border-slate-200 scroll-mt-20"
  >
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <SectionHeading
          id="workspace-title"
          eyebrow="LAYANAN MANDIRI PASIEN"
          title={<>Jadwal Dokter, Pendaftaran Online &amp; Status Antrean</>}
          description="Pilih jadwal dokter untuk menerbitkan nomor antrean kunjungan, atau periksa status antrean yang sedang dipanggil."
        />

        <div
          className="inline-flex p-1 rounded-xl bg-white border border-slate-200 shadow-xs self-start md:self-auto"
          role="group"
          aria-label="Pilih layanan"
        >
          {MODES.map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => onModeChange(mode)}
              aria-pressed={activeMode === mode}
              className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
                activeMode === mode ? 'bg-brand text-white shadow-xs' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {catalogLoading && !catalogError && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-semibold text-slate-700"
        >
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-brand" aria-hidden="true" />
          <span>Memuat jadwal dokter dan status antrean terbaru...</span>
        </div>
      )}

      {catalogError && (
        <div
          role="alert"
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3"
        >
          <div className="flex items-start gap-2.5 text-sm text-amber-900">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{catalogError}</span>
          </div>
          <button
            type="button"
            onClick={onRetry}
            disabled={catalogLoading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white text-xs font-bold cursor-pointer disabled:opacity-60 self-start sm:self-auto shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${catalogLoading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>{catalogLoading ? 'Memuat ulang...' : 'Coba Lagi'}</span>
          </button>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={activeMode}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
          className={activeMode === 'daftar' ? 'grid grid-cols-1 lg:grid-cols-12 gap-8 items-start' : ''}
        >
          {activeMode === 'daftar' ? bookingContent : queueContent}
        </motion.div>
      </AnimatePresence>
    </div>
  </section>
);
