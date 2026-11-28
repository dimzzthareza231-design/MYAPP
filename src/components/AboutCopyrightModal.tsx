/**
 * @license Apache-2.0
 * Copyright (c) 2026 Dimas Pangestu Putra Alifia. All Rights Reserved.
 * Original Creator & Architect of MYITARU.
 */

import React, { useState, useEffect } from 'react';
import { ShieldCheck, Award, FileText, X, Info, Building2, UserCheck } from 'lucide-react';
import { MYITARU_COPYRIGHT, printSystemSignature } from '../utils/systemSignature';

interface AboutCopyrightModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutCopyrightModal: React.FC<AboutCopyrightModalProps> = ({ isOpen, onClose }) => {
  useEffect(() => {
    printSystemSignature();
  }, []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="myitaru-about-title"
    >
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 to-teal-800 px-6 py-4 flex items-center justify-between text-white">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-amber-300" />
            <h2 id="myitaru-about-title" className="text-base font-bold tracking-tight">
              Tentang Sistem & Hak Cipta MYITARU
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 text-sm text-slate-700">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-start gap-2.5">
              <UserCheck className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Pencipta Asli & Arsitek Utama
                </p>
                <p className="font-bold text-slate-900 text-base">
                  {MYITARU_COPYRIGHT.originalCreator}
                </p>
                <p className="text-xs text-slate-600">
                  {MYITARU_COPYRIGHT.program} (NIM {MYITARU_COPYRIGHT.studentId})
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 pt-2 border-t border-slate-200/80">
              <Building2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Institusi & Status Hibah
                </p>
                <p className="font-medium text-slate-800">{MYITARU_COPYRIGHT.institution}</p>
                <p className="text-xs text-slate-500">
                  Sistem MYITARU • Versi {MYITARU_COPYRIGHT.version}
                </p>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 flex items-start gap-2.5">
            <Award className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-950 space-y-1">
              <p className="font-bold">Perlindungan Hak Moral & Lisensi Terbuka</p>
              <p>
                Lisensi: <span className="font-semibold">{MYITARU_COPYRIGHT.license}</span>
              </p>
              <p>
                Status HKI: <span className="font-semibold">{MYITARU_COPYRIGHT.djkiStatus}</span>
              </p>
              <p className="text-amber-800 pt-1 leading-relaxed">
                Sesuai UU No. 28 Tahun 2014 tentang Hak Cipta dan ketentuan Apache License 2.0,
                atribusi pencipta asli wajib dipertahankan pada seluruh turunan maupun pengembangan
                lanjutan aplikasi ini.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />
            <a className="font-mono text-blue-700 hover:underline" href="/LICENSE" target="_blank" rel="noreferrer">LICENSE</a>
            <a className="font-mono text-blue-700 hover:underline" href="/NOTICE" target="_blank" rel="noreferrer">NOTICE</a>
            <a className="font-mono text-blue-700 hover:underline" href="/AUTHORS.md" target="_blank" rel="noreferrer">AUTHORS</a>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 bg-blue-700 hover:bg-blue-800 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};

export const SystemCopyrightFooterBadge: React.FC = () => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    printSystemSignature();
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 text-xs text-blue-200 hover:text-white transition-colors py-1 px-2 rounded-md hover:bg-white/10"
        title="Informasi Hak Cipta & Pencipta Aplikasi MYITARU"
      >
        <Info className="w-3.5 h-3.5" />
        <span>
          MYITARU v{MYITARU_COPYRIGHT.version} • © {MYITARU_COPYRIGHT.year}{' '}
          <strong>{MYITARU_COPYRIGHT.originalCreator}</strong>
        </span>
      </button>

      <AboutCopyrightModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
};

export default AboutCopyrightModal;
