import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Sparkles,
  GripVertical,
  BrainCircuit,
  AlertTriangle,
  AlertCircle,
  Activity,
  Pill,
  RotateCcw,
  CheckCircle2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Clock,
  RefreshCw,
  FileCheck,
  BedDouble,
  Stethoscope,
  Info
} from 'lucide-react';
import toast from 'react-hot-toast';

export interface AIInsightCardItem {
  id: string;
  moduleId: string;
  title: string;
  subtitle: string;
  category: string;
  iconName: 'alert' | 'trend' | 'pill' | 'claim' | 'bed' | 'stewardship';
  metrics: { label: string; value: string; status?: 'normal' | 'warning' | 'critical' | 'info' }[];
  insights: { text: string; type: 'critical' | 'warning' | 'recommendation' | 'success' }[];
  actionLabel: string;
  actionRoute: string;
  lastUpdated: string;
}

const DEFAULT_INSIGHT_CARDS: AIInsightCardItem[] = [
  {
    id: 'triage_critical_monitor',
    moduleId: 'igd',
    title: 'Triase & Early Warning (NEWS-2)',
    subtitle: 'Pemantauan Skor Kritis & Deteksi Sepsis Dini',
    category: 'IGD & Ruang Kritis',
    iconName: 'alert',
    metrics: [
      { label: 'Pasien High-Risk', value: '2 Kasus', status: 'critical' },
      { label: 'Rata-rata Triase', value: '3.8 Menit', status: 'normal' },
      { label: 'Kepatuhan EWS', value: '98.2%', status: 'info' }
    ],
    insights: [
      {
        text: 'Pasien Ny. Siti (RM-09122) NEWS-2: 7 (Takhikardia & Hipotensi). Direkomendasikan skrining laktat & evaluasi sepsis bundle.',
        type: 'critical'
      },
      {
        text: 'Pasien Tn. Budi di Triase IGD menunjukkan desaturasi SpO2 89%. Dianjurkan kanul O2 4 Lpm.',
        type: 'warning'
      }
    ],
    actionLabel: 'Buka Modul Triase IGD',
    actionRoute: '/modul/triase',
    lastUpdated: 'Baru saja'
  },
  {
    id: 'diagnostic_epidemic_forecast',
    moduleId: 'rawat-jalan',
    title: 'Surveilans & Prediksi Epidemiologi',
    subtitle: 'Deteksi Kluster Penyakit Menular & Tren Poliklinik',
    category: 'Rawat Jalan & Litbang',
    iconName: 'trend',
    metrics: [
      { label: 'Kasus ISPA', value: '+31% Pekan Ini', status: 'warning' },
      { label: 'Demam Dengue', value: '8 Terkonfirmasi', status: 'warning' },
      { label: 'Akurasi Prediksi', value: '94.6%', status: 'normal' }
    ],
    insights: [
      {
        text: 'Peningkatan kluster kasus demam berdarah di Wilayah Kelurahan Sukajadi. Siapkan cadangan RDT NS1 di Laboratorium.',
        type: 'warning'
      },
      {
        text: 'Kapasitas Poli Penyakit Dalam diproyeksikan melonjak 22% pada pukul 09.00–11.30 esok hari.',
        type: 'recommendation'
      }
    ],
    actionLabel: 'Buka Poliklinik & Antrean',
    actionRoute: '/modul/poli',
    lastUpdated: '3 menit lalu'
  },
  {
    id: 'drug_interaction_safety',
    moduleId: 'apotek-ralan',
    title: 'Pharmacovigilance & Interaksi Obat',
    subtitle: 'Skrining Kontraindikasi & Dosis Resep Elektronik',
    category: 'Farmasi & Patient Safety',
    iconName: 'pill',
    metrics: [
      { label: 'Resep Di-scan', value: '184 R/', status: 'normal' },
      { label: 'Interaksi Dicegah', value: '3 Insiden', status: 'critical' },
      { label: 'Safety Index', value: '99.4%', status: 'normal' }
    ],
    insights: [
      {
        text: 'Interaksi signifikan terdeteksi: Clopidogrel + Omeprazole menurunkan efek antiplatelet. Pertimbangkan Pantoprazole.',
        type: 'critical'
      },
      {
        text: 'Penyesuaian dosis Ciprofloxacin direkomendasikan pada pasien lansia dengan eGFR < 30 mL/min.',
        type: 'recommendation'
      }
    ],
    actionLabel: 'Buka Modul Farmasi & Obat',
    actionRoute: '/modul/apotek-ralan',
    lastUpdated: '1 menit lalu'
  },
  {
    id: 'bpjs_claims_readiness',
    moduleId: 'vclaim',
    title: 'AI Smart Coder & INA-CBGs Pre-Check',
    subtitle: 'Validasi Kelengkapan Resume Medis & Klaim BPJS',
    category: 'Casemix & Keuangan',
    iconName: 'claim',
    metrics: [
      { label: 'Klaim Siap Kirim', value: '42 Berkas', status: 'normal' },
      { label: 'Potensi Dispute', value: '2 Berkas', status: 'warning' },
      { label: 'Kesesuaian Tarif', value: 'Rp 148.2 jt', status: 'normal' }
    ],
    insights: [
      {
        text: '2 klaim Rawat Inap bedah berisiko pending verifikasi: laporan operasi belum dilengkapi tanda tangan digital dokter.',
        type: 'warning'
      },
      {
        text: 'Kesesuaian diagnosis sekunder ICD-10 dengan terapi penunjang terverifikasi 97.8% valid.',
        type: 'success'
      }
    ],
    actionLabel: 'Review Klaim BPJS & VClaim',
    actionRoute: '/modul/vclaim',
    lastUpdated: '5 menit lalu'
  },
  {
    id: 'bed_capacity_optimizer',
    moduleId: 'rawat-inap',
    title: 'Kapasitas Tempat Tidur & Discharge Predictor',
    subtitle: 'Optimalisasi BOR & Prediksi Pasien Pulang (KRS)',
    category: 'Rawat Inap & Manajemen Bed',
    iconName: 'bed',
    metrics: [
      { label: 'BOR Terkini', value: '78.5%', status: 'normal' },
      { label: 'Prediksi KRS Hari Ini', value: '11 Pasien', status: 'info' },
      { label: 'Bed ICU Tersedia', value: '3 Bed', status: 'normal' }
    ],
    insights: [
      {
        text: '7 pasien Paviliun Dahlia memenuhi kriteria pemulangan klinis. Pengosongan bed dapat dijadwalkan sebelum pukul 13.00.',
        type: 'recommendation'
      },
      {
        text: 'Ruang Isolasi Tekanan Negatif terisi 100%. Rencanakan eskalasi bed cadangan di Gedung B.',
        type: 'warning'
      }
    ],
    actionLabel: 'Kelola Bed Management',
    actionRoute: '/modul/rawat-inap',
    lastUpdated: '4 menit lalu'
  },
  {
    id: 'antimicrobial_stewardship',
    moduleId: 'mutu',
    title: 'Clinical Pathway & Antimicrobial Stewardship',
    subtitle: 'Kepatuhan Restriksi Antibiotik & Standar Mutu',
    category: 'Komite Medik & Akreditasi',
    iconName: 'stewardship',
    metrics: [
      { label: 'Kepatuhan Restriksi', value: '96.5%', status: 'normal' },
      { label: 'De-eskalasi Oral', value: '4 Pasien', status: 'info' },
      { label: 'Kepatuhan CP', value: '92.4%', status: 'normal' }
    ],
    insights: [
      {
        text: 'Hasil kultur sputum sensitif pada Amoksisilin-Klavulanat. Rekomendasi de-eskalasi dari Meropenem.',
        type: 'recommendation'
      },
      {
        text: 'Kepatuhan Surgical Safety Checklist kamar operasi minggu ini mencapai 100% tanpa insiden.',
        type: 'success'
      }
    ],
    actionLabel: 'Buka Patient Safety & Mutu',
    actionRoute: '/modul/mutu',
    lastUpdated: '10 menit lalu'
  }
];

const STORAGE_KEY = 'myitaru_ai_clinical_insights_order';

export function AIClinicalInsightsGrid() {
  const navigate = useNavigate();
  const { hasAccess, facilityMode } = useAuth();

  const [cards, setCards] = useState<AIInsightCardItem[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const orderIds: string[] = JSON.parse(saved);
        const cardMap = new Map(DEFAULT_INSIGHT_CARDS.map((c) => [c.id, c]));
        const ordered: AIInsightCardItem[] = [];
        orderIds.forEach((id) => {
          const card = cardMap.get(id);
          if (card) {
            ordered.push(card);
            cardMap.delete(id);
          }
        });
        cardMap.forEach((card) => ordered.push(card));
        return ordered;
      }
    } catch (e) {
      console.warn('Gagal membaca susunan layout grid tersimpan:', e);
    }
    return DEFAULT_INSIGHT_CARDS;
  });

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [collapsedCards, setCollapsedCards] = useState<Record<string, boolean>>({});
  const [gridColumns, setGridColumns] = useState<'3' | '2'>('3');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRearrangeMode, setIsRearrangeMode] = useState(false);

  const saveOrderToStorage = (newCards: AIInsightCardItem[]) => {
    try {
      const ids = newCards.map((c) => c.id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch (e) {
      console.warn('Gagal menyimpan urutan card ke local storage:', e);
    }
  };

  const reorderCards = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    const sourceIndex = cards.findIndex((c) => c.id === sourceId);
    const targetIndex = cards.findIndex((c) => c.id === targetId);
    if (sourceIndex === -1 || targetIndex === -1) return;

    const updated = [...cards];
    const [moved] = updated.splice(sourceIndex, 1);
    updated.splice(targetIndex, 0, moved);

    setCards(updated);
    saveOrderToStorage(updated);
    toast.success(`Panel "${moved.title}" dipindahkan ke posisi baru`, { id: 'grid-reorder' });
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverId !== id) {
      setDragOverId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData('text/plain') || draggedId;
    if (sourceId && sourceId !== targetId) {
      reorderCards(sourceId, targetId);
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverId(null);
  };

  const moveCard = (id: string, direction: 'up' | 'down') => {
    const visibleIndex = visibleCards.findIndex((c) => c.id === id);
    if (visibleIndex === -1) return;
    const targetVisibleIndex = direction === 'up' ? visibleIndex - 1 : visibleIndex + 1;
    if (targetVisibleIndex < 0 || targetVisibleIndex >= visibleCards.length) return;

    const targetId = visibleCards[targetVisibleIndex].id;
    reorderCards(id, targetId);
  };

  const resetLayout = () => {
    setCards(DEFAULT_INSIGHT_CARDS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    toast.success('Tata letak panel dikembalikan ke susunan standar');
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success('Analitik klinis berhasil dimutakhirkan');
    }, 600);
  };

  const toggleCollapse = (id: string) => {
    setCollapsedCards((prev) => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const renderIcon = (name: AIInsightCardItem['iconName']) => {
    switch (name) {
      case 'alert':
        return <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400" />;
      case 'trend':
        return <Activity className="w-4 h-4 text-amber-600 dark:text-amber-400" />;
      case 'pill':
        return <Pill className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />;
      case 'claim':
        return <FileCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />;
      case 'bed':
        return <BedDouble className="w-4 h-4 text-[#0B3D91] dark:text-sky-400" />;
      case 'stewardship':
        return <Stethoscope className="w-4 h-4 text-teal-600 dark:text-teal-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-[#0B3D91] dark:text-sky-400" />;
    }
  };

  const renderInsightIcon = (type: 'critical' | 'warning' | 'recommendation' | 'success') => {
    switch (type) {
      case 'critical':
        return <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />;
      case 'warning':
        return <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />;
      case 'success':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />;
      default:
        return <Info className="w-3.5 h-3.5 text-[#0B3D91] dark:text-sky-400 shrink-0 mt-0.5" />;
    }
  };

  const visibleCards = useMemo(
    () => cards.filter((card) => hasAccess(card.moduleId)),
    [cards, hasAccess, facilityMode]
  );

  return (
    <section className="relative z-10">
      {/* Section Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-sky-950/60 border border-blue-200 dark:border-sky-800 flex items-center justify-center text-[#0B3D91] dark:text-sky-400 shrink-0">
            <BrainCircuit className="w-5 h-5" />
          </div>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B3D91] dark:text-sky-400">
              Clinical Decision Telemetry · Modular Grid
            </p>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 dark:text-white tracking-tight">
              AI Clinical Insights &amp; Neural Copilot
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Panel pemantauan klinis modular. Gunakan ikon pegangan di kiri atas kartu untuk menata ulang posisi.
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setIsRearrangeMode(!isRearrangeMode)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 border cursor-pointer ${
              isRearrangeMode
                ? 'bg-[#0B3D91] dark:bg-sky-500 text-white dark:text-slate-950 border-transparent'
                : 'bg-white dark:bg-[#111927] text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <GripVertical className="w-3.5 h-3.5" />
            <span>{isRearrangeMode ? 'Selesai Atur' : 'Atur Tata Letak'}</span>
          </button>

          <div className="hidden sm:flex items-center bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-0.5">
            <button
              type="button"
              onClick={() => setGridColumns('2')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                gridColumns === '2'
                  ? 'bg-white dark:bg-[#111927] text-[#0B3D91] dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              2 Kolom
            </button>
            <button
              type="button"
              onClick={() => setGridColumns('3')}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                gridColumns === '3'
                  ? 'bg-white dark:bg-[#111927] text-[#0B3D91] dark:text-sky-400 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              3 Kolom
            </button>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="p-2 rounded-xl bg-white dark:bg-[#111927] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
            title="Refresh Analitik AI"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#0B3D91] dark:text-sky-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={resetLayout}
            className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-[#111927] border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:text-rose-600 dark:hover:text-rose-400 transition-colors flex items-center gap-1 cursor-pointer"
            title="Kembalikan posisi standar"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden md:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* Rearrange Mode Helper Banner */}
      {isRearrangeMode && (
        <div className="mb-5 px-4 py-3 rounded-xl bg-blue-50 dark:bg-sky-950/50 border border-blue-200 dark:border-sky-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-200">
            <GripVertical className="w-4 h-4 text-[#0B3D91] dark:text-sky-400 shrink-0" />
            <p>
              <strong className="text-slate-900 dark:text-white">Mode Atur Tata Letak Aktif:</strong>{' '}
              Tarik kartu melalui ikon pegangan atau gunakan tombol panah di sudut kartu untuk mengubah urutan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsRearrangeMode(false)}
            className="px-3 py-1 rounded-lg bg-[#0B3D91] dark:bg-sky-500 text-white dark:text-slate-950 font-semibold text-xs shrink-0 cursor-pointer"
          >
            Selesai
          </button>
        </div>
      )}

      {/* Modular Grid */}
      <div
        className={`grid gap-5 transition-all duration-200 ${
          gridColumns === '2' ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
        }`}
      >
        {visibleCards.map((card, index) => {
          const isDragging = draggedId === card.id;
          const isDragOver = dragOverId === card.id && draggedId !== card.id;
          const isCollapsed = collapsedCards[card.id];

          return (
            <div
              key={card.id}
              draggable
              onDragStart={(e) => handleDragStart(e, card.id)}
              onDragOver={(e) => handleDragOver(e, card.id)}
              onDrop={(e) => handleDrop(e, card.id)}
              onDragEnd={handleDragEnd}
              className={`rounded-2xl transition-all duration-200 flex flex-col justify-between bg-white dark:bg-[#111927] border ${
                isDragging
                  ? 'opacity-50 scale-[0.98] border-dashed border-[#0B3D91] dark:border-sky-400'
                  : isDragOver
                  ? 'border-[#0B3D91] dark:border-sky-400 ring-2 ring-[#0B3D91]/20 dark:ring-sky-400/20'
                  : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
              }`}
            >
              {/* Card Header */}
              <div className="p-5 pb-3.5 border-b border-slate-100 dark:border-slate-800/80">
                <div className="flex items-start justify-between gap-2.5">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div
                      className={`mt-0.5 p-1 rounded-lg cursor-grab active:cursor-grabbing transition-colors shrink-0 ${
                        isRearrangeMode
                          ? 'bg-blue-50 dark:bg-sky-950/60 text-[#0B3D91] dark:text-sky-400 border border-blue-200 dark:border-sky-800'
                          : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                      title="Tarik untuk memindahkan panel"
                    >
                      <GripVertical className="w-4 h-4" />
                    </div>

                    <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 flex items-center justify-center shrink-0">
                      {renderIcon(card.iconName)}
                    </div>

                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#0B3D91] dark:text-sky-400">
                        {card.category}
                      </p>
                      <h3 className="font-bold text-slate-900 dark:text-white text-sm leading-snug mt-0.5">
                        {card.title}
                      </h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mt-0.5">
                        {card.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {isRearrangeMode && (
                      <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-900 rounded-lg p-0.5 border border-slate-200 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={() => moveCard(card.id, 'up')}
                          disabled={index === 0}
                          className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 rounded cursor-pointer"
                          title="Geser lebih awal"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveCard(card.id, 'down')}
                          disabled={index === visibleCards.length - 1}
                          className="p-1 text-slate-500 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 rounded cursor-pointer"
                          title="Geser lebih akhir"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => toggleCollapse(card.id)}
                      className="p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                      title={isCollapsed ? 'Perluas Panel' : 'Ciutkan Panel'}
                    >
                      {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Card Body */}
              {!isCollapsed && (
                <div className="p-5 pt-4 flex-1 flex flex-col justify-between space-y-4">
                  {/* Single-layer hairline metric strip */}
                  <div className="grid grid-cols-3 divide-x divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50/70 dark:bg-slate-900/50">
                    {card.metrics.map((metric, mIdx) => (
                      <div key={mIdx} className="p-2.5 text-center">
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-semibold truncate">
                          {metric.label}
                        </p>
                        <p
                          className={`text-xs sm:text-sm font-extrabold font-mono tabular-nums mt-0.5 truncate ${
                            metric.status === 'critical'
                              ? 'text-rose-600 dark:text-rose-400'
                              : metric.status === 'warning'
                              ? 'text-amber-600 dark:text-amber-400'
                              : metric.status === 'info'
                              ? 'text-[#0B3D91] dark:text-sky-400'
                              : 'text-emerald-700 dark:text-emerald-400'
                          }`}
                        >
                          {metric.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  {/* Clinical Recommendations */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-[#0B3D91] dark:text-sky-400" />
                      <span>Rekomendasi Preskriptif</span>
                    </p>

                    <div className="space-y-1.5">
                      {card.insights.map((insight, iIdx) => (
                        <div
                          key={iIdx}
                          className={`p-2.5 rounded-xl text-xs leading-relaxed border flex items-start gap-2 ${
                            insight.type === 'critical'
                              ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-200'
                              : insight.type === 'warning'
                              ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
                              : insight.type === 'success'
                              ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200'
                              : 'bg-slate-50 dark:bg-slate-900/50 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {renderInsightIcon(insight.type)}
                          <span className="flex-1">{insight.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Footer */}
                  <div className="pt-3 flex items-center justify-between text-xs border-t border-slate-100 dark:border-slate-800/80">
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>{card.lastUpdated}</span>
                    </span>

                    <button
                      type="button"
                      onClick={() => navigate(card.actionRoute)}
                      className="inline-flex items-center gap-1 font-bold text-xs text-[#0B3D91] dark:text-sky-400 hover:underline cursor-pointer"
                    >
                      <span>{card.actionLabel}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* Collapsed Bar */}
              {isCollapsed && (
                <div className="px-5 py-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span className="truncate">
                    {card.metrics[0]?.label}:{' '}
                    <strong className="text-slate-900 dark:text-white font-mono">
                      {card.metrics[0]?.value}
                    </strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => navigate(card.actionRoute)}
                    className="text-[#0B3D91] dark:text-sky-400 font-semibold text-xs inline-flex items-center gap-1 cursor-pointer"
                  >
                    <span>Buka</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
