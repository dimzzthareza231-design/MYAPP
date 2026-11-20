import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { RadiologiItem } from './types';
import { DATA_RADIOLOGI_INITIAL } from './data';
import { PermintaanTab } from './PermintaanTab';
import { PACSViewerTab } from './PACSViewerTab';
import { HasilEkspertiseTab } from './HasilEkspertiseTab';
import { KatalogTarifTab } from './KatalogTarifTab';
import { MesinRadiologiTab } from './MesinRadiologiTab';
import { 
  FileText, Activity, Eye, DollarSign, ShieldCheck, 
  Sparkles, Radio, Layers
} from 'lucide-react';

export function RadiologiDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabParam = searchParams.get('tab');

  const mergeRadOrdersWithWorklist = (baseList: RadiologiItem[]): RadiologiItem[] => {
    try {
      const rawOrders = localStorage.getItem('simrs_rad_orders');
      if (!rawOrders) return baseList;
      const parsedOrders = JSON.parse(rawOrders);
      if (!Array.isArray(parsedOrders) || parsedOrders.length === 0) return baseList;

      const existingIds = new Set(baseList.map(r => r.id));
      const existingOrderNos = new Set(baseList.map(r => r.no_order));
      const additions: RadiologiItem[] = [];

      parsedOrders.forEach((o: any) => {
        if (!o?.id || existingIds.has(o.id) || (o.orderNumber && existingOrderNos.has(o.orderNumber))) return;
        const modalitas = (o.modality || 'X-Ray') as RadiologiItem['modalitas'];
        additions.push({
          id: o.id,
          no_order: o.orderNumber || o.id,
          no_rm: o.patientRm || o.no_rm || 'RM-000000',
          nama_pasien: o.patientName || o.nama_pasien || 'Pasien Radiologi',
          umur: 40,
          jenis_kelamin: 'L',
          penjamin: 'BPJS Kesehatan',
          unit_asal: 'Poliklinik / RME',
          dokter_pengirim: o.doctor || 'dr. DPJP',
          indikasi_klinis: o.clinicalIndication || 'Pemeriksaan Radiologi Penunjang',
          diagnosa_kerja: o.clinicalIndication || 'Evaluasi Klinis',
          prioritas: 'Rutin / Elektif',
          modalitas,
          nama_pemeriksaan: o.examName || 'Pemeriksaan Radiologi',
          posisi_proyeksi: modalitas === 'X-Ray' ? 'PA / AP' : 'Standard',
          kode_icd9: '87.44',
          ruang_pemeriksaan: modalitas === 'USG' ? 'Ruang USG 1' : modalitas === 'CT-Scan' ? 'Ruang CT-Scan 128 Slices' : 'Ruang X-Ray 1',
          tanggal_order: new Date().toISOString().split('T')[0],
          waktu_order: typeof o.orderDate === 'string' ? o.orderDate : 'Hari ini',
          status: o.status === 'Tervalidasi' || o.status === 'Selesai' ? 'Selesai & Tervalidasi' : 'Menunggu Antrian',
          screening: {
            alergi_kontras: false,
            penggunaan_kontras: false,
            implan_logam_pacemaker: false,
            status_hamil: false,
            puasa_persiapan: false
          }
        });
      });

      return additions.length > 0 ? [...additions, ...baseList] : baseList;
    } catch {
      return baseList;
    }
  };

  // Master persistent state for radiology orders/studies
  const [radiologiList, setRadiologiList] = useState<RadiologiItem[]>(() => {
    const saved = localStorage.getItem('simrs_radiologi_list');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return mergeRadOrdersWithWorklist(parsed);
        }
      } catch (e) {
        console.warn(e);
      }
    }
    return mergeRadOrdersWithWorklist(DATA_RADIOLOGI_INITIAL);
  });

  const saveRadiologiList = (newList: RadiologiItem[]) => {
    setRadiologiList(newList);
    localStorage.setItem('simrs_radiologi_list', JSON.stringify(newList));
  };

  // Listen to cross-module interline sync events (Outpatient SOAP & RME orders)
  useEffect(() => {
    const handleSync = (evt: Event) => {
      const detail = (evt as CustomEvent)?.detail;
      if (detail?.action === 'RAD_VALIDATED') return;
      try {
        const saved = localStorage.getItem('simrs_radiologi_list');
        const base = saved ? JSON.parse(saved) : DATA_RADIOLOGI_INITIAL;
        const merged = mergeRadOrdersWithWorklist(Array.isArray(base) && base.length > 0 ? base : DATA_RADIOLOGI_INITIAL);
        setRadiologiList(merged);
      } catch (err) {
        console.warn('Radiologi sync error:', err);
      }
    };
    window.addEventListener('simrs-interline-sync', handleSync);
    return () => window.removeEventListener('simrs-interline-sync', handleSync);
  }, []);

  // Active study for PACS or Expertise navigation
  const [activeStudy, setActiveStudy] = useState<RadiologiItem>(radiologiList[0]);
  const [activeTab, setActiveTab] = useState<string>('permintaan');

  useEffect(() => {
    if (!radiologiList.length) return;
    setActiveStudy(prev => {
      if (!prev) return radiologiList[0];
      return radiologiList.find(r => r.id === prev.id) || radiologiList[0];
    });
  }, [radiologiList]);

  // Synchronize with URL or props
  useEffect(() => {
    if (activeTabParam) {
      const lower = activeTabParam.toLowerCase();
      if (lower.includes('permintaan') || lower.includes('antrian') || lower.includes('worklist')) {
        setActiveTab('permintaan');
      } else if (lower.includes('pacs') || lower.includes('citra') || lower.includes('viewer') || lower.includes('dicom')) {
        setActiveTab('pacs');
      } else if (lower.includes('hasil') || lower.includes('ekspertise') || lower.includes('laporan')) {
        setActiveTab('hasil');
      } else if (lower.includes('tarif') || lower.includes('katalog') || lower.includes('harga')) {
        setActiveTab('tarif');
      } else if (lower.includes('alat') || lower.includes('mesin') || lower.includes('kalibrasi') || lower.includes('qc')) {
        setActiveTab('mesin');
      }
    }
  }, [activeTabParam]);

  // Navigate to PACS Viewer with a specific study
  const handleOpenPACS = (item: RadiologiItem) => {
    setActiveStudy(item);
    setActiveTab('pacs');
  };

  // Navigate to Expertise Tab with a specific study
  const handleOpenEkspertise = (item: RadiologiItem) => {
    setActiveStudy(item);
    setActiveTab('hasil');
  };

  const tabsConfig = [
    {
      id: 'permintaan',
      label: 'Worklist & Permintaan',
      icon: Activity,
      count: radiologiList.filter(r => r.status !== 'Selesai & Tervalidasi').length
    },
    {
      id: 'pacs',
      label: 'PACS & DICOM Viewer',
      icon: Eye,
      badge: 'Interactive'
    },
    {
      id: 'hasil',
      label: 'Ekspertise Sp.Rad & AI',
      icon: FileText,
      count: radiologiList.filter(r => r.status === 'Menunggu Ekspertise').length
    },
    {
      id: 'tarif',
      label: 'Katalog & Tarif Radiologi',
      icon: DollarSign
    },
    {
      id: 'mesin',
      label: 'Status Alat & QA/QC',
      icon: ShieldCheck
    }
  ];

  return (
    <div className="p-4 sm:p-6 space-y-6 flex-1 w-full text-left">
      {/* HEADER BANNER */}
      <div className="bg-gradient-to-r from-pink-900/90 via-slate-900 to-indigo-950 p-6 rounded-3xl border border-pink-500/20 text-white shadow-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="p-2.5 bg-pink-600/30 text-pink-400 rounded-2xl border border-pink-500/30 backdrop-blur-md">
              <Radio className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-white flex items-center gap-2">
                Instalasi Radiologi & Diagnostic Imaging
              </h1>
              <p className="text-xs text-pink-200/80">
                Radiology Information System (RIS) & Cloud PACS Terintegrasi MYITARU SIMK
              </p>
            </div>
          </div>
        </div>

        {/* Live Status Indicators */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="px-3 py-1.5 bg-slate-900/80 border border-slate-700 rounded-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span className="text-slate-300 font-mono">PACS Node: 104.28.1.99 (Online)</span>
          </div>

          <div className="px-3 py-1.5 bg-pink-950/60 border border-pink-800 rounded-xl text-pink-300 font-bold flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Deep Learning Active</span>
          </div>
        </div>
      </div>

      {/* TOP NAVIGATION TABS */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {tabsConfig.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                isActive
                  ? 'bg-pink-600 text-white shadow-lg shadow-pink-600/30'
                  : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.count !== undefined && tab.count > 0 && (
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  isActive ? 'bg-white text-pink-600' : 'bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300'
                }`}>
                  {tab.count}
                </span>
              )}
              {tab.badge && (
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                  isActive ? 'bg-pink-800 text-pink-200' : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ACTIVE TAB CONTENT */}
      <div>
        {activeTab === 'permintaan' && (
          <PermintaanTab
            radiologiList={radiologiList}
            onUpdateList={saveRadiologiList}
            onOpenPACS={handleOpenPACS}
            onOpenEkspertise={handleOpenEkspertise}
          />
        )}

        {activeTab === 'pacs' && (
          <PACSViewerTab
            radiologiList={radiologiList}
            selectedStudyItem={activeStudy}
            onOpenEkspertise={handleOpenEkspertise}
          />
        )}

        {activeTab === 'hasil' && (
          <HasilEkspertiseTab
            radiologiList={radiologiList}
            onUpdateList={saveRadiologiList}
            onOpenPACS={handleOpenPACS}
            selectedItemId={activeStudy?.id}
          />
        )}

        {activeTab === 'tarif' && (
          <KatalogTarifTab />
        )}

        {activeTab === 'mesin' && (
          <MesinRadiologiTab />
        )}
      </div>
    </div>
  );


}
