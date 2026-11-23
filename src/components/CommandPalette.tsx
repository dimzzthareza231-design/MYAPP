import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useToast } from '../contexts/ToastContext';
import { Search, ChevronRight, CornerDownLeft, X } from 'lucide-react';
import { useDialogA11y } from '../hooks/useDialogA11y';

interface CommandItem {
  id: number;
  category: string;
  icon: string;
  label: string;
  description: string;
  action: () => void;
}

export function CommandPalette() {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const closePalette = useCallback(() => setIsOpen(false), []);
  // Focus trap, Escape, kunci scroll & kembalikan fokus ke pemicu saat ditutup.
  useDialogA11y(isOpen, closePalette, dialogRef, { initialFocusRef: inputRef });
  const navigate = useNavigate();
  const toast = useToast();

  const allCommands: CommandItem[] = useMemo(() => [
    // Navigation Core
    { id: 1, category: 'Navigasi', icon: '🏠', label: 'Dashboard Utama', description: 'Kembali ke halaman utama SIMK', action: () => navigate('/dashboard') },
    { id: 2, category: 'Navigasi', icon: '📝', label: 'Pendaftaran Pasien', description: 'Registrasi & admisi pasien baru/lama', action: () => navigate('/modul/pendaftaran') },
    { id: 3, category: 'Navigasi', icon: '🏥', label: 'Rawat Jalan (Poliklinik)', description: 'Pelayanan poli dan pemeriksaan dokter', action: () => navigate('/modul/rawat-jalan') },
    { id: 4, category: 'Navigasi', icon: '🚨', label: 'Instalasi Gawat Darurat (IGD)', description: 'Triase darurat dan pasien IGD', action: () => navigate('/modul/igd') },
    { id: 5, category: 'Navigasi', icon: '🛌', label: 'Rawat Inap & Bangsal', description: 'Manajemen tempat tidur (Bed Management)', action: () => navigate('/modul/rawat-inap') },
    { id: 6, category: 'Navigasi', icon: '🔪', label: 'Kamar Operasi (OK)', description: 'Jadwal dan checklist bedah operasi', action: () => navigate('/modul/operasi') },
    { id: 7, category: 'Navigasi', icon: '🔬', label: 'Laboratorium Klinis', description: 'Order & hasil lab darah, urin, mikrobiologi', action: () => navigate('/modul/laboratorium') },
    { id: 8, category: 'Navigasi', icon: '🩻', label: 'Radiologi & PACS', description: 'Pemeriksaan X-Ray, CT-Scan, USG, MRI', action: () => navigate('/modul/radiologi') },
    { id: 9, category: 'Navigasi', icon: '💊', label: 'Apotek & Farmasi Rawat Jalan', description: 'Antrian resep, dispensing & stok obat', action: () => navigate('/modul/apotek-ralan') },
    { id: 10, category: 'Navigasi', icon: '💰', label: 'Kasir & Pembayaran (Billing)', description: 'Kwitansi, invoice & transaksi pembayaran', action: () => navigate('/modul/kasir') },
    { id: 11, category: 'Navigasi', icon: '📁', label: 'Rekam Medis Elektronik (RME)', description: 'Patient 360, riwayat penyakit & SOAP', action: () => navigate('/modul/rekam-medis') },
    { id: 12, category: 'Navigasi', icon: '🛡️', label: 'Integrasi BPJS V-Claim', description: 'Generate SEP, rujukan & status kepesertaan', action: () => navigate('/modul/bpjs-klaim') },
    { id: 13, category: 'Navigasi', icon: '🌐', label: 'Integrasi Kemenkes SatuSehat', description: 'Interoperabilitas FHIR SatuSehat Kemenkes', action: () => navigate('/modul/satu-sehat') },
    { id: 14, category: 'Navigasi', icon: '📊', label: 'Laporan & Indikator Mutu', description: 'Eksekutif analitik & performa rumah sakit', action: () => navigate('/modul/laporan') },
    { id: 15, category: 'Navigasi', icon: '👥', label: 'SDM & Kepegawaian', description: 'Jadwal shift dokter, perawat, absensi & cuti', action: () => navigate('/modul/sdm') },
    { id: 16, category: 'Navigasi', icon: '📦', label: 'Gudang & Logistik Farmasi', description: 'Stock opname, mutasi barang & vendor PO', action: () => navigate('/modul/inventory') },
    { id: 17, category: 'Navigasi', icon: '📋', label: 'Audit Trail & Log Akses', description: 'Riwayat aktivitas user & keamanan sistem', action: () => navigate('/modul/audit') },
    { id: 18, category: 'Navigasi', icon: '⚙️', label: 'Pengaturan Fasilitas / SIMK', description: 'Konfigurasi klinik, tarif & profil Klinik', action: () => navigate('/modul/pengaturan-klinik') },
    { id: 19, category: 'Navigasi', icon: '📚', label: 'Panduan & SOP Penggunaan', description: 'Dokumentasi pedoman dan manual sistem', action: () => navigate('/modul/panduan') },
    { id: 25, category: 'Navigasi', icon: '🫀', label: 'ICU & Critical Care', description: 'Bed monitoring, ventilator, SOFA score & fluid balance', action: () => navigate('/modul/icu') },
    { id: 26, category: 'Navigasi', icon: '🏃', label: 'Rehabilitasi Medik (Fisioterapi)', description: 'Asesmen Barthel, catatan sesi terapi SOAP & home program', action: () => navigate('/modul/rehab') },
    { id: 27, category: 'Navigasi', icon: '🥗', label: 'Gizi & Diet Pasien', description: 'Screening gizi MST, preskripsi diet & monitoring asupan', action: () => navigate('/modul/gizi') },
    { id: 28, category: 'Navigasi', icon: '📹', label: 'Telemedicine & Virtual Care', description: 'Konsultasi video call, e-resep & pemantauan jarak jauh', action: () => navigate('/modul/telemedicine') },
    { id: 29, category: 'Navigasi', icon: '👤', label: 'Portal Mandiri Pasien', description: 'Self-service booking, rekam medis & pembayaran', action: () => navigate('/modul/patient-portal') },
    { id: 30, category: 'Navigasi', icon: '🏢', label: 'Multi-Branch RS', description: 'Operasional terpusat, transfer pasien & konsolidasi cabang', action: () => navigate('/modul/multi-branch') },
    { id: 31, category: 'Navigasi', icon: '🤝', label: 'CRM & Patient Engagement', description: 'Kampanye pesan, survey kepuasan & penanganan keluhan', action: () => navigate('/modul/crm') },

    // Aksi Cepat
    { id: 20, category: 'Aksi Cepat', icon: '➕', label: 'Tambah Pasien Baru', description: 'Buka formulir registrasi pasien baru', action: () => navigate('/modul/pendaftaran') },
    { id: 21, category: 'Aksi Cepat', icon: '🌙', label: 'Ganti Tema Gelap / Terang', description: 'Beralih antara mode gelap dan terang', action: () => {
      window.dispatchEvent(new CustomEvent('toggle-theme'));
      toast.info('Tema tampilan diperbarui');
    }},
    { id: 22, category: 'Aksi Cepat', icon: '🔔', label: 'Pusat Notifikasi', description: 'Buka daftar pemberitahuan sistem', action: () => navigate('/modul/notifikasi') },
    { id: 23, category: 'Aksi Cepat', icon: '🔒', label: 'Manajemen Keamanan & Pengguna', description: 'Kelola hak akses dan akun pengguna', action: () => navigate('/modul/security') },
    { id: 24, category: 'Aksi Cepat', icon: '💾', label: 'Backup & Pemulihan Sistem', description: 'Cadangkan database dan konfigurasi', action: () => navigate('/modul/backup') },
  ], [navigate, toast]);

  const filteredCommands = useMemo(() => {
    if (searchQuery.trim() === '') return allCommands;
    const query = searchQuery.toLowerCase();
    return allCommands.filter(cmd =>
      cmd.label.toLowerCase().includes(query) ||
      cmd.description.toLowerCase().includes(query) ||
      cmd.category.toLowerCase().includes(query)
    );
  }, [allCommands, searchQuery]);

  const groupedCommands = useMemo(() => {
    return filteredCommands.reduce((acc, cmd) => {
      if (!acc[cmd.category]) acc[cmd.category] = [];
      acc[cmd.category].push(cmd);
      return acc;
    }, {} as Record<string, CommandItem[]>);
  }, [filteredCommands]);

  const executeCommand = useCallback((cmd: CommandItem) => {
    cmd.action();
    setIsOpen(false);
    setSearchQuery('');
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsOpen(prev => !prev);
        setSearchQuery('');
        setSelectedIndex(0);
        setTimeout(() => inputRef.current?.focus(), 100);
        return;
      }

      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
        return;
      }

      if (isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + 1, Math.max(0, filteredCommands.length - 1)));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const selected = filteredCommands[selectedIndex];
          if (selected) executeCommand(selected);
        }
      }
    };

    const handleOpen = () => {
      setIsOpen(true);
      setSearchQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    };

    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('open-command-palette', handleOpen);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('open-command-palette', handleOpen);
    };
  }, [isOpen, selectedIndex, filteredCommands, executeCommand]);

  // Pastikan opsi yang dipilih via keyboard tetap terlihat di daftar.
  useEffect(() => {
    if (!isOpen) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-cmd-index="${selectedIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, selectedIndex]);

  if (!isOpen) return null;

  const activeOptionId = filteredCommands[selectedIndex] ? `cmd-option-${filteredCommands[selectedIndex].id}` : undefined;

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-start justify-center z-[200] p-3 sm:p-4 pt-[max(1rem,8vh)] animate-in fade-in duration-200"
      onClick={() => setIsOpen(false)}
    >
      <div 
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Command palette: cari modul dan aksi cepat"
        className="bg-surface text-ink rounded-card shadow-overlay w-full max-w-2xl overflow-hidden border border-line animate-in slide-in-from-top-4 duration-200 flex flex-col max-h-[80dvh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50">
          <Search className="w-5 h-5 text-slate-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            aria-label="Cari modul, layanan, atau aksi cepat"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Cari modul, layanan, atau aksi..."
            className="w-full min-w-0 bg-transparent border-none outline-none focus-visible:outline-none text-slate-900 dark:text-white placeholder-slate-400 text-sm md:text-base font-medium"
            autoFocus
          />
          {searchQuery && (
            <button 
              type="button"
              onClick={() => {
                setSearchQuery('');
                inputRef.current?.focus();
              }}
              className="icon-btn -my-2 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/60"
              aria-label="Hapus kata kunci pencarian"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div ref={listRef} id="command-palette-list" role="listbox" aria-label="Hasil pencarian" className="overflow-y-auto overscroll-contain p-2 divide-y divide-slate-100 dark:divide-slate-800/60 flex-1 min-h-0">
          {filteredCommands.length === 0 ? (
            <div role="status" className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm">
              Tidak ada modul atau aksi yang cocok dengan "{searchQuery}"
            </div>
          ) : (
            Object.entries(groupedCommands).map(([category, items]) => (
              <div key={category} role="group" aria-label={category} className="py-2">
                <div aria-hidden="true" className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {category}
                </div>
                <div className="space-y-1">
                  {items.map((cmd) => {
                    const globalIndex = filteredCommands.findIndex(c => c.id === cmd.id);
                    const isSelected = globalIndex === selectedIndex;
                    return (
                      <button
                        key={cmd.id}
                        id={`cmd-option-${cmd.id}`}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        tabIndex={-1}
                        data-cmd-index={globalIndex}
                        onClick={() => executeCommand(cmd)}
                        onMouseEnter={() => setSelectedIndex(globalIndex)}
                        className={`w-full min-h-touch text-left px-3 py-2.5 rounded-xl flex items-center justify-between transition-colors ${
                          isSelected 
                            ? 'bg-blue-600 text-white' 
                            : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="text-xl shrink-0" aria-hidden="true">{cmd.icon}</span>
                          <div className="min-w-0">
                            <div className={`font-semibold text-sm leading-tight ${isSelected ? 'text-white' : 'text-slate-800 dark:text-slate-100'}`}>
                              {cmd.label}
                            </div>
                            <div className={`text-xs mt-0.5 line-clamp-1 ${isSelected ? 'text-blue-100' : 'text-slate-500 dark:text-slate-400'}`}>
                              {cmd.description}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          {isSelected && (
                            <CornerDownLeft className="w-4 h-4 text-blue-200" />
                          )}
                          <ChevronRight className={`w-4 h-4 ${isSelected ? 'text-blue-200' : 'text-slate-400 opacity-50'}`} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        <div aria-hidden="true" className="hidden sm:flex p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 items-center justify-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded shadow-xs text-[10px]">↑</kbd>
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded shadow-xs text-[10px]">↓</kbd>
            Navigasi
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded shadow-xs text-[10px]">Enter</kbd>
            Pilih
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded shadow-xs text-[10px]">ESC</kbd>
            Tutup
          </span>
        </div>
      </div>
    </div>
  );
}

export default CommandPalette;
