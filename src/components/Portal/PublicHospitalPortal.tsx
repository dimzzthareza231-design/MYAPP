import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  PhoneCall,
  CalendarCheck,
  Smartphone,
  ShieldCheck,
  Stethoscope,
  Clock,
  MapPin,
  CheckCircle2,
  HeartPulse,
  Building2,
  FileText,
  Menu,
  X,
  Ticket,
  RefreshCw,
  ArrowRight,
  UserCheck,
  AlertCircle,
  BedDouble,
  ChevronLeft,
  ChevronRight,
  Activity,
  Sparkles
} from 'lucide-react';
import { motion, AnimatePresence, MotionConfig } from 'motion/react';
import { QRCodeSVG } from 'qrcode.react';
import toast from 'react-hot-toast';
import {
  HOSPITAL_SERVICES,
  CENTERS_OF_EXCELLENCE,
  HOSPITAL_PROMOS,
  INPATIENT_ROOMS,
  VISITING_HOURS_INFO,
  INSURANCE_PARTNERS,
  MCU_PACKAGES,
  HOSPITAL_BRANCHES,
  HEALTH_ARTICLES,
  PATIENT_STORIES,
  getPublicPoliklinik,
  getPublicDoctors,
  type HealthArticle
} from '../../data/hospitalPublicCatalog';
import { type Doctor } from '../../data/seedData';
import { PWAInstallButton } from '../PWA/PWAInstallButton';
import { BrandLogo } from '../Common/BrandLogo';
import { SystemCopyrightFooterBadge } from '../AboutCopyrightModal';

import heroHospitalImg from '../../assets/images/myitaru_building_hero.jpg';
import campusDropoffImg from '../../assets/images/myitaru_campus_dropoff.jpg';
import lobbyMainImg from '../../assets/images/myitaru_lobby_main_branded.jpg';
import lobbyApmImg from '../../assets/images/myitaru_lobby_apm_01.jpg';
import excellenceSuiteImg from '../../assets/images/myitaru_center_of_excellence.jpg';
import doctorConsultImg from '../../assets/images/myitaru_poli_consult.jpg';
import medicalEducationImg from '../../assets/images/edukasi_medis_myitaru.jpg';
import inpatientSuiteImg from '../../assets/images/myitaru_inpatient_room.jpg';
import physiotherapyImg from '../../assets/images/myitaru_physiotherapy_rehab.jpg';
import mobileLifestyleImg from '../../assets/images/patient_mobile_lifestyle_1794532011071.jpg';

interface LiveDoctor extends Doctor {
  kuota_tersisa?: number;
}

interface PoliQueueSnapshot {
  id: string;
  kode: string;
  nama: string;
  sedangDipanggil: string;
  totalMenunggu: number;
}

interface QueueLookupMatch {
  id: string;
  nomor_antrian: string;
  no_rm: string;
  pasien_nama_masked: string;
  poli: string;
  dokter: string;
  tanggal: string;
  jam_praktek: string;
  status: string;
  tipe: string;
  sedang_dipanggil: string;
  antrean_di_depan: number;
  estimasi_menit: number;
}

interface RecentTicketSummary {
  nomor_antrian: string;
  no_rm: string;
  poli: string;
  dokter: string;
  tanggal: string;
  jam_praktek: string;
}

interface HeroSlide {
  id: string;
  eyebrow: string;
  titlePrefix: string;
  titleHighlight: string;
  description: string;
  image: string;
  imageAlt: string;
  tabLabel: string;
  primaryActionLabel: string;
  primaryActionMode: 'daftar' | 'antrean';
  primaryAnchor: string;
  presetPoliKode?: string;
}

const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'slide-main',
    eyebrow: 'MYITARU SIMK · LAYANAN MEDIS 24 JAM',
    titlePrefix: 'Pelayanan Kesehatan Terpadu dengan',
    titleHighlight: 'Akses Pendaftaran & Antrean Digital.',
    description:
      'Pilih jadwal dokter spesialis, daftar poliklinik secara online tanpa antre di loket, dan pantau giliran nomor antrean Anda secara real-time.',
    image: heroHospitalImg,
    imageAlt: 'Atrium Utama MYITARU',
    tabLabel: 'Layanan Utama 24 Jam',
    primaryActionLabel: 'Pendaftaran Online',
    primaryActionMode: 'daftar',
    primaryAnchor: 'portal-workspace'
  },
  {
    id: 'slide-rehab',
    eyebrow: 'FISIOTERAPI, SPORTS MEDICINE & HOME CARE EKSKLUSIF',
    titlePrefix: 'Pemulihan Cedera & Rehabilitasi Gerak',
    titleHighlight: 'Di Klinik maupun di Rumah Anda.',
    description:
      'Ditangani oleh dokter spesialis rehabilitasi medik & fisioterapis bersertifikat untuk nyeri punggung, cedera olahraga, hingga pemulihan pascastroke.',
    image: physiotherapyImg,
    imageAlt: 'Pusat Fisioterapi dan Rehabilitasi Medik MYITARU',
    tabLabel: 'Fisioterapi & Home Care',
    primaryActionLabel: 'Jadwalkan Fisioterapi',
    primaryActionMode: 'daftar',
    primaryAnchor: 'formulir-pendaftaran',
    presetPoliKode: 'RHB'
  },
  {
    id: 'slide-inpatient',
    eyebrow: 'RAWAT INAP NYAMAN · DELUXE HINGGA JUNIOR SUITE',
    titlePrefix: 'Kenyamanan Ruang Perawatan',
    titleHighlight: 'Dengan Pengawasan Tim Medis 24 Jam.',
    description:
      'Lima pilihan kelas kamar rawat inap modern dilengkapi pemantauan tanda vital berkelanjutan, gizi klinis terukur, serta fasilitas pendamping keluarga.',
    image: inpatientSuiteImg,
    imageAlt: 'Kamar Rawat Inap Executive Suite MYITARU',
    tabLabel: 'Fasilitas Rawat Inap',
    primaryActionLabel: 'Lihat Kelas Kamar',
    primaryActionMode: 'daftar',
    primaryAnchor: 'rawat-inap'
  },
  {
    id: 'slide-campus',
    eyebrow: 'KAMPUS KESEHATAN MYITARU · AKSES FASILITAS',
    titlePrefix: 'Akses Kampus dan Area Drop-off',
    titleHighlight: 'Dirancang untuk Kunjungan yang Lebih Mudah.',
    description:
      'Temukan akses utama fasilitas MYITARU dan lanjutkan ke informasi layanan sebelum berkunjung.',
    image: campusDropoffImg,
    imageAlt: 'Area akses dan drop-off kampus MYITARU',
    tabLabel: 'Akses Kampus',
    primaryActionLabel: 'Jelajahi Layanan',
    primaryActionMode: 'daftar',
    primaryAnchor: 'portal-workspace'
  },
  {
    id: 'slide-lobby',
    eyebrow: 'FASILITAS MYITARU · LOBI UTAMA',
    titlePrefix: 'Lingkungan yang Nyaman',
    titleHighlight: 'Dengan Layanan Terpadu sejak Kedatangan.',
    description:
      'Informasi layanan, pendaftaran, dan bantuan kunjungan tersedia dalam satu portal.',
    image: lobbyMainImg,
    imageAlt: 'Lobi utama MYITARU',
    tabLabel: 'Lobi Utama',
    primaryActionLabel: 'Lihat Informasi',
    primaryActionMode: 'daftar',
    primaryAnchor: 'portal-workspace'
  },
  {
    id: 'slide-apm',
    eyebrow: 'PENDAFTARAN MANDIRI · FASILITAS MYITARU',
    titlePrefix: 'Pendaftaran Pasien yang Lebih Praktis',
    titleHighlight: 'Didukung Informasi dan Layanan Terpadu.',
    description:
      'Akses informasi kunjungan dan layanan pendaftaran MYITARU secara lebih mudah, baik sebelum maupun saat berada di fasilitas.',
    image: lobbyApmImg,
    imageAlt: 'Area pendaftaran mandiri APM di lobi MYITARU',
    tabLabel: 'Pendaftaran Mandiri',
    primaryActionLabel: 'Mulai Pendaftaran',
    primaryActionMode: 'daftar',
    primaryAnchor: 'formulir-pendaftaran'
  },
  {
    id: 'slide-education',
    eyebrow: 'EDUKASI MEDIS · MYITARU',
    titlePrefix: 'Informasi Kesehatan yang Mudah Dipahami',
    titleHighlight: 'Untuk Membantu Pasien Mengambil Langkah Tepat.',
    description:
      'Baca panduan kesehatan dan informasi layanan yang disusun untuk mendukung perjalanan perawatan pasien.',
    image: medicalEducationImg,
    imageAlt: 'Edukasi medis MYITARU',
    tabLabel: 'Edukasi Medis',
    primaryActionLabel: 'Baca Panduan',
    primaryActionMode: 'daftar',
    primaryAnchor: 'artikel'
  }
];

const RECENT_TICKETS_KEY = 'myitaru_public_recent_tickets';
const EASE_OUT_EXPO = [0.16, 1, 0.3, 1] as const;
const VIEWPORT_CONFIG = { once: true, amount: 0.14 } as const;

export const PublicHospitalPortal: React.FC = () => {
  const navigate = useNavigate();

  const poliklinikList = useMemo(() => getPublicPoliklinik(), []);
  const fallbackDoctors = useMemo(() => getPublicDoctors(), []);

  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [activeMode, setActiveMode] = useState<'daftar' | 'antrean'>('daftar');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Interactive Directories State
  const [serviceCategoryFilter, setServiceCategoryFilter] = useState<
    'Semua' | 'Klinik & Darurat' | 'Penunjang Medis' | 'Terapi & Khusus'
  >('Semua');
  const [selectedRoomId, setSelectedRoomId] = useState<string>(INPATIENT_ROOMS[3].id);
  const [insuranceFilter, setInsuranceFilter] = useState<
    'Semua' | 'JKN / Pemerintah' | 'Asuransi Swasta' | 'Korporasi & TPA'
  >('Semua');
  // Grid panjang dipotong ke 6 kartu agar halaman tidak terlalu tinggi.
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  // Catalog & Live Poli Queues
  const [doctors, setDoctors] = useState<LiveDoctor[]>(fallbackDoctors);
  const [poliQueues, setPoliQueues] = useState<PoliQueueSnapshot[]>(() =>
    poliklinikList.slice(0, 12).map((pol) => ({
      id: pol.id,
      kode: pol.kode,
      nama: pol.nama,
      sedangDipanggil: `${pol.kode}-001`,
      totalMenunggu: 2
    }))
  );
  const [queueUpdatedAt, setQueueUpdatedAt] = useState<string>('');

  // Doctor Filter State
  const [doctorSearch, setDoctorSearch] = useState('');
  const [selectedPoliId, setSelectedPoliId] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('Semua');
  const [showAllDoctors, setShowAllDoctors] = useState(false);

  // Article Reader Modal
  const [activeArticle, setActiveArticle] = useState<HealthArticle | null>(null);

  // Registration Form State
  const [selectedDoctor, setSelectedDoctor] = useState<LiveDoctor>(() => fallbackDoctors[0]);
  const [bookingForm, setBookingForm] = useState({
    isExistingPatient: false,
    no_rm: '',
    nama: '',
    tanggal_lahir: '1990-05-15',
    no_hp: '',
    tanggal: new Date().toISOString().split('T')[0],
    penjamin: 'Umum / Mandiri',
    keluhan: ''
  });
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<{
    kode_booking: string;
    no_rm: string;
    tanggal_lahir: string;
    nama: string;
    nomor_antrian: string;
    poli: string;
    dokter: string;
    tanggal: string;
    jam_praktek: string;
    penjamin: string;
    qr_value: string;
  } | null>(null);

  // Recent tickets saved locally for quick queue re-check
  const [recentTickets, setRecentTickets] = useState<RecentTicketSummary[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_TICKETS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Queue Lookup State
  const [queueQuery, setQueueQuery] = useState('');
  const [queueSearching, setQueueSearching] = useState(false);
  const [queueSearchedQuery, setQueueSearchedQuery] = useState('');
  const [queueMatches, setQueueMatches] = useState<QueueLookupMatch[]>([]);
  const [sampleTickets, setSampleTickets] = useState<
    Array<{ nomor_antrian: string; no_rm: string; poli: string }>
  >([
    { nomor_antrian: 'PD-001', no_rm: 'RM-260101-0001', poli: 'Poli Penyakit Dalam' },
    { nomor_antrian: 'IGD-004', no_rm: 'RM-260103-0003', poli: 'Instalasi Gawat Darurat (IGD)' }
  ]);

  // Auto-advance hero showcase slides softly every 7 seconds
  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSlideIdx((prev) => (prev + 1) % HERO_SLIDES.length);
    }, 7000);
    return () => window.clearInterval(timer);
  }, []);

  const fetchCatalogAndQueues = useCallback(async (queryText = '') => {
    try {
      const [catalogRes, queueRes] = await Promise.all([
        fetch('/api/public/hospital-catalog'),
        fetch(`/api/public/queue-status${queryText ? `?q=${encodeURIComponent(queryText)}` : ''}`)
      ]);

      if (catalogRes.ok) {
        const catData = await catalogRes.json();
        if (Array.isArray(catData?.doctors) && catData.doctors.length > 0) {
          setDoctors(catData.doctors);
        }
      }

      if (queueRes.ok) {
        const qData = await queueRes.json();
        if (Array.isArray(qData?.poliQueues)) {
          setPoliQueues(qData.poliQueues);
        }
        if (Array.isArray(qData?.sampleTickets) && qData.sampleTickets.length > 0) {
          setSampleTickets(qData.sampleTickets);
        }
        if (qData?.updatedAt) {
          setQueueUpdatedAt(qData.updatedAt);
        }
        if (queryText) {
          setQueueMatches(Array.isArray(qData?.matches) ? qData.matches : []);
          setQueueSearchedQuery(qData?.query || queryText.toUpperCase());
        }
      }
    } catch {
      // Retain deterministic seed catalog seamlessly
    }
  }, []);

  useEffect(() => {
    fetchCatalogAndQueues();
  }, [fetchCatalogAndQueues]);

  const filteredDoctors = useMemo(() => {
    const q = doctorSearch.trim().toLowerCase();
    return doctors.filter((doc) => {
      const matchesSearch =
        !q ||
        doc.nama.toLowerCase().includes(q) ||
        doc.spesialis.toLowerCase().includes(q) ||
        doc.poli.toLowerCase().includes(q) ||
        (doc.subspesialis || '').toLowerCase().includes(q);

      const matchesPoli = selectedPoliId === 'ALL' || doc.poli_id === selectedPoliId;
      if (!matchesSearch || !matchesPoli) return false;
      if (selectedCategory === 'Semua') return true;

      const poliObj = poliklinikList.find((p) => p.id === doc.poli_id);
      return poliObj?.kategori === selectedCategory;
    });
  }, [doctors, doctorSearch, selectedPoliId, selectedCategory, poliklinikList]);

  const visibleDoctors = showAllDoctors ? filteredDoctors : filteredDoctors.slice(0, 6);

  const filteredServices = useMemo(() => {
    if (serviceCategoryFilter === 'Semua') return HOSPITAL_SERVICES;
    return HOSPITAL_SERVICES.filter((srv) => srv.category === serviceCategoryFilter);
  }, [serviceCategoryFilter]);

  const selectedRoom = useMemo(
    () => INPATIENT_ROOMS.find((room) => room.id === selectedRoomId) || INPATIENT_ROOMS[0],
    [selectedRoomId]
  );

  const filteredInsurances = useMemo(() => {
    if (insuranceFilter === 'Semua') return INSURANCE_PARTNERS;
    return INSURANCE_PARTNERS.filter((partner) => partner.type === insuranceFilter);
  }, [insuranceFilter]);

  const handleSelectDoctor = (doc: LiveDoctor) => {
    setSelectedDoctor(doc);
    setBookingSuccess(null);
    setActiveMode('daftar');
    const el = document.getElementById('formulir-pendaftaran');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  };

  const handlePresetBooking = (poliKode?: string, presetKeluhan?: string) => {
    const targetPoli = poliKode ? poliklinikList.find((p) => p.kode === poliKode) : undefined;
    const chosenDoc =
      (targetPoli ? doctors.find((d) => d.poli_id === targetPoli.id) : undefined) || doctors[0];

    if (targetPoli) {
      setSelectedPoliId(targetPoli.id);
      setSelectedCategory('Semua');
    }
    if (chosenDoc) {
      setSelectedDoctor(chosenDoc);
    }
    if (presetKeluhan) {
      setBookingForm((prev) => ({ ...prev, keluhan: presetKeluhan }));
    }
    setBookingSuccess(null);
    setActiveMode('daftar');
    setTimeout(() => {
      const el = document.getElementById('formulir-pendaftaran');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 60);
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctor) {
      toast.error('Silakan pilih poliklinik dan dokter tujuan.');
      return;
    }
    if (bookingForm.isExistingPatient && !bookingForm.no_rm.trim()) {
      toast.error('Masukkan Nomor Rekam Medis (No. RM) Anda.');
      return;
    }
    if (!bookingForm.isExistingPatient && !bookingForm.nama.trim()) {
      toast.error('Masukkan nama lengkap pasien.');
      return;
    }

    setIsSubmittingBooking(true);
    try {
      const res = await fetch('/api/patient/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nama: bookingForm.nama,
          no_rm: bookingForm.isExistingPatient ? bookingForm.no_rm : undefined,
          tanggal_lahir: bookingForm.tanggal_lahir,
          no_hp: bookingForm.no_hp,
          poli_id: selectedDoctor.poli_id,
          poli_nama: selectedDoctor.poli,
          dokter_id: selectedDoctor.id,
          dokter_nama: selectedDoctor.nama,
          tanggal: bookingForm.tanggal,
          jam_praktek: selectedDoctor.jam || '08:00 - 13:00 WIB',
          penjamin: bookingForm.penjamin,
          keluhan: bookingForm.keluhan
        })
      });

      const data = await res.json();
      if (!res.ok || !data?.success) {
        toast.error(data?.message || 'Gagal memproses pendaftaran online.');
        return;
      }

      const ticket: RecentTicketSummary = {
        nomor_antrian: data.booking.nomor_antrian,
        no_rm: data.booking.no_rm,
        poli: data.booking.poli,
        dokter: data.booking.dokter,
        tanggal: data.booking.tanggal,
        jam_praktek: data.booking.jam_praktek
      };

      const nextTickets = [
        ticket,
        ...recentTickets.filter((t) => t.nomor_antrian !== ticket.nomor_antrian)
      ].slice(0, 5);
      setRecentTickets(nextTickets);
      try {
        localStorage.setItem(RECENT_TICKETS_KEY, JSON.stringify(nextTickets));
      } catch {
        // Ignore storage errors
      }

      setBookingSuccess(data.booking);
      toast.success(`Booking ${data.booking.kode_booking} berhasil dibuat.`);
      fetchCatalogAndQueues();
    } catch {
      toast.error('Koneksi ke server terganggu. Silakan coba beberapa saat lagi.');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleQueueLookup = async (overrideQuery?: string) => {
    const q = (overrideQuery ?? queueQuery).trim();
    if (!q) {
      toast.error('Masukkan Nomor Antrean (mis. PD-001) atau No. RM.');
      return;
    }
    if (overrideQuery !== undefined) {
      setQueueQuery(overrideQuery);
    }
    setActiveMode('antrean');
    setQueueSearching(true);
    try {
      const res = await fetch(`/api/public/queue-status?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (res.ok && data?.success) {
        setQueueMatches(Array.isArray(data.matches) ? data.matches : []);
        setQueueSearchedQuery(data.query || q.toUpperCase());
        if (Array.isArray(data.poliQueues)) {
          setPoliQueues(data.poliQueues);
        }
        if (data.updatedAt) {
          setQueueUpdatedAt(data.updatedAt);
        }
      } else {
        toast.error(data?.message || 'Gagal memeriksa status antrean.');
      }
    } catch {
      toast.error('Gagal menghubungi layanan antrean.');
    } finally {
      setQueueSearching(false);
    }
  };

  const scrollToWorkspace = (mode?: 'daftar' | 'antrean', anchorId = 'portal-workspace') => {
    setMobileMenuOpen(false);
    if (mode) setActiveMode(mode);
    setTimeout(() => {
      const el = document.getElementById(anchorId);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  };

  const formatRupiah = (amount: number) =>
    new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      maximumFractionDigits: 0
    }).format(amount);

  const formatTimeLabel = (iso: string) => {
    if (!iso) return 'Diperbarui hari ini';
    try {
      return `Diperbarui ${new Date(iso).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })} WIB`;
    } catch {
      return 'Diperbarui hari ini';
    }
  };

  const currentSlide = HERO_SLIDES[activeSlideIdx];

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col">
        {/* Top Emergency, Customer Relations & Visiting Hours Info Strip */}
        <div className="bg-[#082B6B] text-white text-xs py-2 px-4 sm:px-6 lg:px-8 border-b border-white/10">
          <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="tel:1500911"
                className="inline-flex items-center gap-2 font-semibold text-white hover:text-red-200 transition whitespace-nowrap shrink-0"
              >
                <span className="inline-flex items-center gap-1 bg-[#DC2626] px-2 py-0.5 rounded font-bold tracking-wide">
                  <PhoneCall className="w-3 h-3" /> IGD 24 JAM
                </span>
                <span className="font-mono tabular-nums font-bold">1-500-911</span>
              </a>
              <span className="hidden md:inline text-blue-200">
                Jam Besuk Rawat Inap: {VISITING_HOURS_INFO.morningSession} &amp;{' '}
                {VISITING_HOURS_INFO.eveningSession}
              </span>
              <span className="hidden lg:inline text-blue-200">
                · Customer Relations (021) 5098-8800
              </span>
            </div>

            <button
              type="button"
              onClick={() => navigate('/mobile')}
              className="inline-flex items-center gap-1.5 text-sky-200 hover:text-white font-semibold cursor-pointer whitespace-nowrap shrink-0"
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Buka App Mobile Pasien</span>
            </button>
          </div>
        </div>

        {/* Strict 3-Zone Patient-Only Sticky Header */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between gap-6">
            {/* Zone 1: Brand Wordmark */}
            <button
              type="button"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 cursor-pointer"
            >
              <BrandLogo alt="MYITARU" className="w-9 h-9 rounded-xl shadow-xs object-cover" />
              <span className="text-lg sm:text-xl font-extrabold tracking-tight text-[#0B3D91]">
                MYITARU
              </span>
            </button>

            {/* Zone 2: Concise Patient Navigation Links */}
            <nav className="hidden xl:flex items-center gap-6 text-sm font-semibold text-slate-700">
              <button
                type="button"
                onClick={() => scrollToWorkspace('daftar', 'portal-workspace')}
                className="hover:text-[#0B3D91] transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                Jadwal &amp; Antrean
              </button>
              <button
                type="button"
                onClick={() => scrollToWorkspace(undefined, 'layanan-medis')}
                className="hover:text-[#0B3D91] transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                Layanan Medis
              </button>
              <button
                type="button"
                onClick={() => scrollToWorkspace(undefined, 'pusat-unggulan')}
                className="hover:text-[#0B3D91] transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                Pusat Unggulan
              </button>
              <button
                type="button"
                onClick={() => scrollToWorkspace(undefined, 'rawat-inap')}
                className="hover:text-[#0B3D91] transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                Rawat Inap
              </button>
              <button
                type="button"
                onClick={() => scrollToWorkspace(undefined, 'promo-mcu')}
                className="hover:text-[#0B3D91] transition whitespace-nowrap shrink-0 cursor-pointer"
              >
                Promo &amp; MCU
              </button>
            </nav>

            {/* Zone 3: Single Primary Patient CTA + Mobile Trigger */}
            <div className="flex items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={() => scrollToWorkspace('daftar', 'formulir-pendaftaran')}
                className="inline-flex items-center gap-2 bg-[#0B3D91] hover:bg-[#082D6E] text-white text-sm font-semibold px-4 py-2.5 rounded-xl shadow-xs transition whitespace-nowrap shrink-0 cursor-pointer min-h-[44px]"
              >
                <CalendarCheck className="w-4 h-4 shrink-0" />
                <span>Daftar Online</span>
              </button>

              <button
                type="button"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label="Menu Navigasi"
                className="xl:hidden p-2.5 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-50 cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>

          {/* Mobile Drawer */}
          <AnimatePresence>
            {mobileMenuOpen && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                className="xl:hidden overflow-hidden bg-white border-t border-slate-200"
              >
                <div className="px-4 py-4 space-y-1.5">
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace('daftar', 'portal-workspace')}
                    className="w-full text-left px-3 py-3 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Jadwal Dokter &amp; Daftar Online
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace('antrean', 'portal-workspace')}
                    className="w-full text-left px-3 py-3 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Cek Nomor Antrean Real-Time
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace(undefined, 'layanan-medis')}
                    className="w-full text-left px-3 py-3 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Layanan Kesehatan &amp; Penunjang
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace(undefined, 'pusat-unggulan')}
                    className="w-full text-left px-3 py-3 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Pusat Layanan Unggulan
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace(undefined, 'rawat-inap')}
                    className="w-full text-left px-3 py-3 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Kamar Rawat Inap &amp; Jam Besuk
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace(undefined, 'promo-mcu')}
                    className="w-full text-left px-3 py-3 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Promo &amp; Paket Medical Check-Up
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace(undefined, 'artikel')}
                    className="w-full text-left px-3 py-3 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Healthpedia &amp; Cerita Pasien
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace(undefined, 'cabang')}
                    className="w-full text-left px-3 py-3 rounded-xl font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Lokasi &amp; Kontak
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      navigate('/mobile');
                    }}
                    className="w-full text-left px-3 py-3 rounded-xl font-semibold text-[#0B3D91] bg-blue-50"
                  >
                    Buka Aplikasi Mobile Pasien
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        {/* Section 1: Multi-Slide Hospital Hero Showcase + Floating Quick Search & Queue Dock */}
        <section className="relative overflow-hidden bg-[#061A3D]">
          <div className="relative min-h-[500px] lg:min-h-[570px] flex items-center overflow-hidden">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentSlide.id}
                initial={{ opacity: 0.35, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0.25 }}
                transition={{ duration: 0.75, ease: EASE_OUT_EXPO }}
                className="absolute inset-0"
              >
                <img
                  src={currentSlide.image}
                  alt={currentSlide.imageAlt}
                  className="w-full h-full object-cover object-center"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#051430]/95 via-[#0B3D91]/80 to-[#0B3D91]/25" />
              </motion.div>
            </AnimatePresence>

            <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-14 sm:py-16 pb-28 sm:pb-32">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={currentSlide.id}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
                    className="max-w-2xl space-y-5"
                  >
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">
                      {currentSlide.eyebrow}
                    </p>

                    <h1 className="text-3xl sm:text-5xl font-extrabold text-white leading-[1.12] tracking-tight text-balance">
                      {currentSlide.titlePrefix}{' '}
                      <span className="relative inline-block text-sky-200">
                        {currentSlide.titleHighlight}
                        <span
                          aria-hidden="true"
                          className="block h-1 w-full bg-sky-400/70 rounded-full mt-1"
                        />
                      </span>
                    </h1>

                    <p className="text-base sm:text-lg text-slate-100 leading-relaxed max-w-xl">
                      {currentSlide.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 pt-2">
                      <motion.button
                        type="button"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                          if (currentSlide.presetPoliKode) {
                            handlePresetBooking(currentSlide.presetPoliKode, currentSlide.tabLabel);
                          } else {
                            scrollToWorkspace(currentSlide.primaryActionMode, currentSlide.primaryAnchor);
                          }
                        }}
                        className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-[#0B3D91] font-bold px-6 py-3.5 rounded-xl shadow-lg transition cursor-pointer min-h-[48px] text-sm sm:text-base whitespace-nowrap shrink-0"
                      >
                        <CalendarCheck className="w-5 h-5 shrink-0" />
                        <span>{currentSlide.primaryActionLabel}</span>
                      </motion.button>

                      <motion.button
                        type="button"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => scrollToWorkspace('antrean', 'portal-workspace')}
                        className="inline-flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 border border-white/35 text-white font-semibold px-6 py-3.5 rounded-xl backdrop-blur-xs transition cursor-pointer min-h-[48px] text-sm sm:text-base whitespace-nowrap shrink-0"
                      >
                        <Ticket className="w-5 h-5 shrink-0" />
                        <span>Cek Nomor Antrean</span>
                      </motion.button>
                    </div>
                  </motion.div>
                </AnimatePresence>

                {/* Hero Carousel Controls & Slide Selector */}
                <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setActiveSlideIdx((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length)
                      }
                      aria-label="Slide sebelumnya"
                      className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white flex items-center justify-center transition cursor-pointer"
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSlideIdx((prev) => (prev + 1) % HERO_SLIDES.length)}
                      aria-label="Slide berikutnya"
                      className="w-10 h-10 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white flex items-center justify-center transition cursor-pointer"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {HERO_SLIDES.map((slide, idx) => (
                      <button
                        key={slide.id}
                        type="button"
                        onClick={() => setActiveSlideIdx(idx)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                          idx === activeSlideIdx
                            ? 'bg-white text-[#0B3D91] shadow-xs'
                            : 'bg-white/10 text-blue-100 hover:bg-white/20 border border-white/20'
                        }`}
                      >
                        {slide.tabLabel}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Floating Quick Search & Queue Dock */}
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.25, ease: EASE_OUT_EXPO }}
            className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 pb-10"
          >
            <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-4 sm:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
                <div className="lg:col-span-5">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Cari Dokter / Poliklinik Spesialis
                  </label>
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={doctorSearch}
                      onChange={(e) => setDoctorSearch(e.target.value)}
                      placeholder="Contoh: Penyakit Dalam, Orthopedi, Mata, dr. Hendra..."
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm focus:bg-white focus:border-[#0B3D91] transition outline-none"
                    />
                  </div>
                </div>

                <div className="lg:col-span-3">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Poliklinik Tujuan
                  </label>
                  <select
                    value={selectedPoliId}
                    onChange={(e) => {
                      setSelectedPoliId(e.target.value);
                      setSelectedCategory('Semua');
                    }}
                    className="w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm focus:bg-white focus:border-[#0B3D91] transition outline-none"
                  >
                    <option value="ALL">Semua Poliklinik ({poliklinikList.length} Unit)</option>
                    {poliklinikList.map((poli) => (
                      <option key={poli.id} value={poli.id}>
                        {poli.nama}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="lg:col-span-4 grid grid-cols-2 gap-2.5">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => scrollToWorkspace('daftar', 'portal-workspace')}
                    className="bg-[#0B3D91] hover:bg-[#082D6E] text-white font-bold py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer min-h-[46px] text-sm whitespace-nowrap shrink-0"
                  >
                    <Search className="w-4 h-4 shrink-0" />
                    <span>Cari &amp; Daftar</span>
                  </motion.button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.98 }}
                    onClick={() => scrollToWorkspace('antrean', 'portal-workspace')}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer min-h-[46px] text-sm whitespace-nowrap shrink-0"
                  >
                    <Ticket className="w-4 h-4 shrink-0 text-[#0B3D91]" />
                    <span>Cek Antrean</span>
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Section 2: Primary Patient Service Workspace (Pendaftaran Online & Cek Nomor Antrean) */}
        <section id="portal-workspace" className="py-12 sm:py-16 bg-slate-50 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_CONFIG}
              transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
              className="flex flex-col md:flex-row md:items-end justify-between gap-4"
            >
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0B3D91]">
                  LAYANAN MANDIRI PASIEN
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                  Jadwal Dokter, Pendaftaran Online &amp; Status Antrean
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Pilih jadwal dokter untuk menerbitkan nomor antrean kunjungan, atau periksa status antrean yang sedang dipanggil.
                </p>
              </div>

              <div className="inline-flex p-1 rounded-xl bg-white border border-slate-200 shadow-xs self-start md:self-auto">
                <button
                  type="button"
                  onClick={() => setActiveMode('daftar')}
                  className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
                    activeMode === 'daftar'
                      ? 'bg-[#0B3D91] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CalendarCheck className="w-4 h-4 shrink-0" />
                  <span>Pendaftaran Online</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('antrean')}
                  className={`px-4 py-2.5 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 transition cursor-pointer whitespace-nowrap shrink-0 ${
                    activeMode === 'antrean'
                      ? 'bg-[#0B3D91] text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Ticket className="w-4 h-4 shrink-0" />
                  <span>Cek Nomor Antrean</span>
                </button>
              </div>
            </motion.div>

            <AnimatePresence mode="wait">
              {activeMode === 'daftar' ? (
                <motion.div
                  key="workspace-daftar"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                  className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
                >
                  {/* Doctor Directory */}
                  <div className="lg:col-span-7 space-y-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex flex-wrap gap-2">
                        {['Semua', 'Spesialis Utama', 'Subspesialis', 'Penunjang & Khusus'].map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => {
                              setSelectedCategory(cat);
                              setSelectedPoliId('ALL');
                            }}
                            className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer min-h-[38px] whitespace-nowrap shrink-0 ${
                              selectedCategory === cat
                                ? 'bg-[#0B3D91] text-white'
                                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                      <span className="text-xs font-mono tabular-nums font-semibold text-slate-500">
                        {filteredDoctors.length} Dokter Praktik
                      </span>
                    </div>

                    {filteredDoctors.length === 0 ? (
                      <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center">
                        <Stethoscope className="w-10 h-10 text-slate-400 mx-auto mb-3" />
                        <p className="font-bold text-slate-800">Jadwal dokter tidak ditemukan</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Coba ubah kata kunci pencarian atau pilih semua poliklinik.
                        </p>
                        <button
                          type="button"
                          onClick={() => {
                            setDoctorSearch('');
                            setSelectedPoliId('ALL');
                            setSelectedCategory('Semua');
                          }}
                          className="mt-4 px-4 py-2 rounded-xl bg-[#0B3D91] text-white text-xs font-bold cursor-pointer"
                        >
                          Reset Filter
                        </button>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          {visibleDoctors.map((doc, idx) => {
                            const isSelected = selectedDoctor?.id === doc.id;
                            const quotaLeft =
                              doc.kuota_tersisa !== undefined
                                ? doc.kuota_tersisa
                                : Math.max(2, (doc.kuota || 25) - (doc.pasien_terlayani || 8));

                            const initials = doc.nama
                              .replace(/^(dr\.|drg\.)\s*/i, '')
                              .split(' ')
                              .slice(0, 2)
                              .map((n) => n[0])
                              .join('');

                            return (
                              <motion.div
                                key={doc.id}
                                initial={{ opacity: 0, y: 14 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  duration: 0.35,
                                  delay: Math.min(idx * 0.04, 0.24),
                                  ease: EASE_OUT_EXPO
                                }}
                                whileHover={{ y: -4 }}
                                className={`rounded-2xl border p-5 flex flex-col justify-between bg-white transition shadow-xs hover:shadow-md ${
                                  isSelected
                                    ? 'border-[#0B3D91] ring-2 ring-[#0B3D91]/15'
                                    : 'border-slate-200 hover:border-[#0B3D91]/40'
                                }`}
                              >
                                <div>
                                  <div className="flex items-start gap-3">
                                    <div className="w-11 h-11 rounded-xl bg-[#0B3D91]/10 text-[#0B3D91] font-extrabold text-sm flex items-center justify-center shrink-0">
                                      {initials}
                                    </div>
                                    <div className="min-w-0">
                                      <h3 className="font-bold text-slate-900 text-sm leading-snug">
                                        {doc.nama}
                                      </h3>
                                      <p className="text-xs font-semibold text-[#0B3D91] mt-0.5">
                                        {doc.spesialis}
                                      </p>
                                      {doc.subspesialis && (
                                        <p className="text-[11px] text-slate-500 mt-0.5">{doc.subspesialis}</p>
                                      )}
                                    </div>
                                  </div>

                                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                                    <div className="flex items-center gap-2">
                                      <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      <span className="truncate">
                                        {doc.poli} · {doc.ruangan || 'Poliklinik Utama'}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      <span className="font-mono tabular-nums">
                                        {doc.hari || 'Senin - Jumat'} · {doc.jam || '08:00 - 13:00 WIB'}
                                      </span>
                                    </div>
                                  </div>
                                </div>

                                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                                  <div className="text-xs">
                                    <span className="font-semibold text-emerald-700">
                                      {doc.status_jaga || 'Berpraktik'}
                                    </span>
                                    <span className="text-slate-300 mx-1.5">·</span>
                                    <span className="font-mono tabular-nums text-slate-600">
                                      Sisa {quotaLeft}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectDoctor(doc)}
                                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                                      isSelected
                                        ? 'bg-[#0B3D91] text-white'
                                        : 'bg-slate-100 hover:bg-[#0B3D91] text-slate-800 hover:text-white'
                                    }`}
                                  >
                                    {isSelected ? 'Dipilih' : 'Pilih & Daftar'}
                                  </button>
                                </div>
                              </motion.div>
                            );
                          })}
                        </div>

                        {filteredDoctors.length > 6 && (
                          <div className="text-center pt-1">
                            <button
                              type="button"
                              onClick={() => setShowAllDoctors((v) => !v)}
                              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[#0B3D91]/30 bg-white text-[#0B3D91] font-bold text-xs hover:bg-blue-50 transition cursor-pointer"
                            >
                              <span>
                                {showAllDoctors
                                  ? 'Tampilkan Lebih Sedikit'
                                  : `Lihat Seluruh ${filteredDoctors.length} Dokter Spesialis`}
                              </span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Sticky Online Registration Form */}
                  <div id="formulir-pendaftaran" className="lg:col-span-5">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden sticky top-24">
                      <div className="bg-[#0B3D91] text-white px-6 py-4">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-sky-200">
                          FORMULIR PENDAFTARAN ONLINE
                        </p>
                        <h3 className="text-lg font-extrabold mt-0.5">
                          {bookingSuccess ? 'Kartu Nomor Antrean Diterbitkan' : 'Registrasi Kunjungan Poliklinik'}
                        </h3>
                      </div>

                      <AnimatePresence mode="wait">
                        {bookingSuccess ? (
                          <motion.div
                            key="booking-ticket-success"
                            initial={{ opacity: 0, scale: 0.96, y: 10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.96 }}
                            transition={{ duration: 0.3, ease: EASE_OUT_EXPO }}
                            className="p-6 space-y-5"
                          >
                            <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 text-center space-y-1.5">
                              <CheckCircle2 className="w-9 h-9 text-emerald-600 mx-auto" />
                              <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                                Kode Booking Anda
                              </p>
                              <p className="text-3xl font-extrabold font-mono tabular-nums text-[#0B3D91]">
                                {bookingSuccess.kode_booking}
                              </p>
                              <p className="text-xs text-slate-600">
                                No. RM dan nomor antrean dikonfirmasi petugas saat check-in.
                              </p>
                            </div>

                            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2 text-xs">
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-500">Nama Pasien</span>
                                <span className="font-bold text-slate-900 text-right">{bookingSuccess.nama}</span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-500">Poliklinik</span>
                                <span className="font-bold text-slate-900 text-right">{bookingSuccess.poli}</span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-500">Dokter</span>
                                <span className="font-bold text-slate-900 text-right">{bookingSuccess.dokter}</span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-500">Jadwal</span>
                                <span className="font-mono tabular-nums font-bold text-slate-900 text-right">
                                  {bookingSuccess.tanggal} · {bookingSuccess.jam_praktek}
                                </span>
                              </div>
                              <div className="flex justify-between gap-2">
                                <span className="text-slate-500">Penjamin</span>
                                <span className="font-bold text-slate-900 text-right">{bookingSuccess.penjamin}</span>
                              </div>
                            </div>

                            {bookingSuccess.qr_value && (
                              <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex flex-col items-center gap-2 text-center">
                                <QRCodeSVG value={bookingSuccess.qr_value} size={144} level="M" />
                                <p className="text-xs font-bold text-blue-900">QR Reservasi MYITARU</p>
                                <p className="text-[11px] text-slate-600">
                                  Tunjukkan QR ini kepada petugas saat tiba pada tanggal kunjungan untuk check-in.
                                  QR terenkripsi dan hanya dapat diproses setelah petugas login.
                                </p>
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <button
                                type="button"
                                onClick={() => handleQueueLookup(bookingSuccess.nomor_antrian)}
                                className="w-full py-3 rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white font-bold text-xs cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <Ticket className="w-4 h-4" />
                                <span>Cek Status Antrean</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setBookingSuccess(null)}
                                className="w-full py-3 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
                              >
                                Daftar Kunjungan Lain
                              </button>
                            </div>
                          </motion.div>
                        ) : (
                          <motion.form
                            key="booking-form-fields"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            onSubmit={handleBookingSubmit}
                            className="p-6 space-y-4"
                          >
                            <div className="rounded-xl bg-blue-50/70 border border-blue-200 p-3.5 text-xs space-y-1">
                              <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B3D91]">
                                Dokter &amp; Poliklinik Dipilih
                              </p>
                              <p className="font-bold text-slate-900 text-sm">{selectedDoctor?.nama}</p>
                              <p className="text-slate-600">
                                {selectedDoctor?.poli} ·{' '}
                                <span className="font-mono tabular-nums">
                                  {selectedDoctor?.jam || '08:00 - 13:00 WIB'}
                                </span>
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
                              <button
                                type="button"
                                onClick={() => setBookingForm((p) => ({ ...p, isExistingPatient: false }))}
                                className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                                  !bookingForm.isExistingPatient
                                    ? 'bg-white text-[#0B3D91] shadow-xs'
                                    : 'text-slate-600'
                                }`}
                              >
                                Pasien Baru
                              </button>
                              <button
                                type="button"
                                onClick={() => setBookingForm((p) => ({ ...p, isExistingPatient: true }))}
                                className={`py-2 rounded-lg text-xs font-bold transition cursor-pointer ${
                                  bookingForm.isExistingPatient
                                    ? 'bg-white text-[#0B3D91] shadow-xs'
                                    : 'text-slate-600'
                                }`}
                              >
                                Sudah Punya No. RM
                              </button>
                            </div>

                            {bookingForm.isExistingPatient ? (
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Nomor Rekam Medis (No. RM) *
                                </label>
                                <input
                                  type="text"
                                  value={bookingForm.no_rm}
                                  onChange={(e) => setBookingForm((p) => ({ ...p, no_rm: e.target.value }))}
                                  placeholder="Contoh: RM-260101-0001"
                                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm font-mono uppercase focus:border-[#0B3D91] outline-none"
                                  required
                                />
                              </div>
                            ) : (
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Nama Lengkap Pasien *
                                </label>
                                <input
                                  type="text"
                                  value={bookingForm.nama}
                                  onChange={(e) => setBookingForm((p) => ({ ...p, nama: e.target.value }))}
                                  placeholder="Sesuai KTP / Identitas Resmi"
                                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#0B3D91] outline-none"
                                  required
                                />
                              </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Tanggal Lahir *
                                </label>
                                <input
                                  type="date"
                                  value={bookingForm.tanggal_lahir}
                                  onChange={(e) =>
                                    setBookingForm((p) => ({ ...p, tanggal_lahir: e.target.value }))
                                  }
                                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#0B3D91] outline-none"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  No. HP / WhatsApp *
                                </label>
                                <input
                                  type="tel"
                                  value={bookingForm.no_hp}
                                  onChange={(e) => setBookingForm((p) => ({ ...p, no_hp: e.target.value }))}
                                  placeholder="0812xxxxxxxx"
                                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#0B3D91] outline-none"
                                  required
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Tanggal Kunjungan *
                                </label>
                                <input
                                  type="date"
                                  value={bookingForm.tanggal}
                                  min={new Date().toISOString().split('T')[0]}
                                  onChange={(e) => setBookingForm((p) => ({ ...p, tanggal: e.target.value }))}
                                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#0B3D91] outline-none"
                                  required
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-bold text-slate-700 mb-1">
                                  Metode Penjamin
                                </label>
                                <select
                                  value={bookingForm.penjamin}
                                  onChange={(e) => setBookingForm((p) => ({ ...p, penjamin: e.target.value }))}
                                  className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm bg-white focus:border-[#0B3D91] outline-none"
                                >
                                  <option value="Umum / Mandiri">Umum / Mandiri</option>
                                  <option value="BPJS Kesehatan">BPJS Kesehatan</option>
                                  <option value="Asuransi Swasta / Perusahaan">Asuransi Swasta / Perusahaan</option>
                                </select>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Keluhan Utama / Tujuan Layanan
                              </label>
                              <textarea
                                rows={2}
                                value={bookingForm.keluhan}
                                onChange={(e) => setBookingForm((p) => ({ ...p, keluhan: e.target.value }))}
                                placeholder="Tuliskan keluhan singkat atau layanan yang diinginkan..."
                                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:border-[#0B3D91] outline-none"
                              />
                            </div>

                            <motion.button
                              type="submit"
                              disabled={isSubmittingBooking}
                              whileTap={{ scale: 0.98 }}
                              className="w-full py-3.5 rounded-xl bg-[#0B3D91] hover:bg-[#082D6E] text-white font-bold text-sm transition cursor-pointer disabled:opacity-60 flex items-center justify-center gap-2 min-h-[48px]"
                            >
                              <CalendarCheck className="w-4 h-4" />
                              <span>
                                {isSubmittingBooking
                                  ? 'Menerbitkan Nomor Antrean...'
                                  : 'Daftar & Ambil Nomor Antrean'}
                              </span>
                            </motion.button>
                          </motion.form>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              ) : (
                /* Queue Lookup + Live Poliklinik Board */
                <motion.div
                  key="workspace-antrean"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                  className="space-y-6"
                >
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleQueueLookup();
                      }}
                      className="flex flex-col sm:flex-row gap-3"
                    >
                      <div className="relative flex-1">
                        <Search className="w-5 h-5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={queueQuery}
                          onChange={(e) => setQueueQuery(e.target.value)}
                          placeholder="Masukkan Nomor Antrean (mis. PD-001) atau No. RM (RM-260101-0001)..."
                          className="w-full pl-12 pr-4 py-3.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-[#0B3D91] font-mono text-sm uppercase outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={queueSearching}
                        className="bg-[#0B3D91] hover:bg-[#082D6E] text-white font-bold px-6 py-3.5 rounded-xl transition cursor-pointer flex items-center justify-center gap-2 min-h-[48px] text-sm shrink-0"
                      >
                        <Ticket className="w-4 h-4" />
                        <span>{queueSearching ? 'Memeriksa...' : 'Cek Antrean'}</span>
                      </button>
                    </form>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-slate-500">Cek Cepat:</span>
                      {recentTickets.map((t) => (
                        <button
                          key={t.nomor_antrian}
                          type="button"
                          onClick={() => handleQueueLookup(t.nomor_antrian)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono font-bold hover:bg-emerald-100 cursor-pointer"
                        >
                          {t.nomor_antrian} · Tiket Anda
                        </button>
                      ))}
                      {sampleTickets.map((s) => (
                        <button
                          key={s.nomor_antrian}
                          type="button"
                          onClick={() => handleQueueLookup(s.nomor_antrian)}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 font-mono font-semibold hover:bg-slate-200 cursor-pointer"
                        >
                          {s.nomor_antrian} ({s.no_rm})
                        </button>
                      ))}
                    </div>

                    {queueSearchedQuery && (
                      <div className="pt-4 border-t border-slate-200">
                        {queueMatches.length === 0 ? (
                          <div className="rounded-xl bg-amber-50 border border-amber-200 p-5 flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                            <div className="text-sm">
                              <p className="font-bold text-amber-900">
                                Nomor antrean atau No. RM “{queueSearchedQuery}” belum ditemukan hari ini.
                              </p>
                              <p className="text-xs text-amber-800 mt-1">
                                Pastikan kode antrean benar atau buat pendaftaran poliklinik online terlebih dahulu.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {queueMatches.map((m, idx) => (
                              <motion.div
                                key={m.id}
                                initial={{ opacity: 0, y: 12 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.3, delay: idx * 0.05, ease: EASE_OUT_EXPO }}
                                whileHover={{ y: -3 }}
                                className="rounded-2xl border border-[#0B3D91]/25 bg-blue-50/40 p-5 space-y-4 transition shadow-xs hover:shadow-md"
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                                      Nomor Antrean Anda
                                    </p>
                                    <p className="text-3xl font-extrabold font-mono tabular-nums text-[#0B3D91]">
                                      {m.nomor_antrian}
                                    </p>
                                    <p className="text-xs text-slate-600 mt-0.5 flex items-center gap-1.5">
                                      <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                                      <span>{m.pasien_nama_masked}</span>
                                      <span className="text-slate-400">·</span>
                                      <span className="font-mono">{m.no_rm}</span>
                                    </p>
                                  </div>
                                  <span
                                    className={`px-3 py-1 rounded-lg text-xs font-bold ${
                                      m.status === 'Diperiksa' || m.status === 'Panggil'
                                        ? 'bg-emerald-600 text-white'
                                        : m.status === 'Selesai'
                                        ? 'bg-slate-200 text-slate-700'
                                        : 'bg-amber-100 text-amber-900 border border-amber-200'
                                    }`}
                                  >
                                    {m.status}
                                  </span>
                                </div>

                                <div className="grid grid-cols-3 gap-2 text-center bg-white rounded-xl border border-slate-200 p-3">
                                  <div>
                                    <p className="text-[11px] text-slate-500">Sedang Dipanggil</p>
                                    <p className="font-mono tabular-nums font-extrabold text-sm text-[#0B3D91] mt-0.5">
                                      {m.sedang_dipanggil}
                                    </p>
                                  </div>
                                  <div className="border-x border-slate-200">
                                    <p className="text-[11px] text-slate-500">Antrean di Depan</p>
                                    <p className="font-mono tabular-nums font-extrabold text-sm text-slate-900 mt-0.5">
                                      {m.antrean_di_depan} pasien
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-[11px] text-slate-500">Estimasi Tunggu</p>
                                    <p className="font-mono tabular-nums font-extrabold text-sm text-emerald-700 mt-0.5">
                                      {m.estimasi_menit === 0 ? 'Giliran Anda' : `~${m.estimasi_menit} mnt`}
                                    </p>
                                  </div>
                                </div>

                                <div className="text-xs text-slate-600 space-y-1">
                                  <p>
                                    <strong className="text-slate-900">{m.poli}</strong> · {m.dokter}
                                  </p>
                                  <p className="font-mono tabular-nums text-slate-500">
                                    {m.tanggal} · {m.jam_praktek}
                                  </p>
                                </div>
                              </motion.div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-[#0B3D91]">
                          PAPAN PANTAUAN ANTREAN POLIKLINIK
                        </p>
                        <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">
                          Nomor Dipanggil Real-Time Hari Ini
                        </h3>
                        <p className="text-xs text-slate-500 mt-0.5">{formatTimeLabel(queueUpdatedAt)}</p>
                      </div>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.97 }}
                        onClick={() => fetchCatalogAndQueues(queueSearchedQuery)}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer self-start sm:self-auto"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Perbarui Status</span>
                      </motion.button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
                      {poliQueues.slice(0, 12).map((pq, idx) => (
                        <motion.div
                          key={pq.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.24), ease: EASE_OUT_EXPO }}
                          whileHover={{ y: -3 }}
                          className="rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white hover:border-[#0B3D91]/35 hover:shadow-xs p-4 flex items-center justify-between gap-3 transition"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 truncate">{pq.nama}</p>
                            <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                              {pq.totalMenunggu} menunggu
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[10px] font-semibold uppercase text-slate-400">Dipanggil</p>
                            <p className="font-mono tabular-nums font-extrabold text-base text-[#0B3D91]">
                              {pq.sedangDipanggil}
                            </p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* Section 3: Direktori Layanan Kesehatan Lengkap */}
        <section id="layanan-medis" className="py-16 sm:py-20 bg-white border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_CONFIG}
              transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
              className="flex flex-col lg:flex-row lg:items-end justify-between gap-6"
            >
              <div className="max-w-2xl">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0B3D91]">
                  DIREKTORI LAYANAN KESEHATAN
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                  Unit Pelayanan Medis, Penunjang &amp; Terapi 24 Jam
                </h2>
                <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                  Seluruh instalasi medis dari Rawat Jalan Spesialis, IGD, Kamar Operasi, Hemodialisa, Fisioterapi Home Care, hingga Telemedicine terhubung dalam satu sistem rekam medis.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(['Semua', 'Klinik & Darurat', 'Penunjang Medis', 'Terapi & Khusus'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setServiceCategoryFilter(cat)}
                    className={`px-4 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      serviceCategoryFilter === cat
                        ? 'bg-[#0B3D91] text-white shadow-xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {cat === 'Semua' ? 'Semua Layanan (12)' : cat}
                  </button>
                ))}
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {(expanded.layanan ? filteredServices : filteredServices.slice(0, 6)).map((srv, idx) => (
                <motion.div
                  key={srv.id}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT_CONFIG}
                  transition={{ duration: 0.4, delay: Math.min(idx * 0.04, 0.2), ease: EASE_OUT_EXPO }}
                  whileHover={{ y: -4 }}
                  className="group rounded-2xl border border-slate-200 bg-slate-50/60 hover:bg-white hover:border-[#0B3D91]/40 hover:shadow-md p-6 flex flex-col justify-between transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-[#0B3D91] font-semibold">
                      <span>{srv.category}</span>
                      <Activity className="w-4 h-4 text-[#0B3D91]" />
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900 mt-2 group-hover:text-[#0B3D91] transition-colors">
                      {srv.title}
                    </h3>
                    <p className="text-xs font-mono text-slate-500 mt-1">{srv.availability}</p>
                    <p className="text-sm text-slate-600 mt-3 leading-relaxed">{srv.summary}</p>

                    <ul className="mt-4 pt-3 border-t border-slate-200/80 space-y-1.5">
                      {srv.highlights.map((item) => (
                        <li key={item} className="text-xs text-slate-700 flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-200/80">
                    <button
                      type="button"
                      onClick={() => handlePresetBooking(srv.poliKode, `Pendaftaran Layanan: ${srv.title}`)}
                      className="text-xs font-bold text-[#0B3D91] hover:text-[#082D6E] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Jadwalkan Layanan Ini</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
            {filteredServices.length > 6 && (
              <div className="flex justify-center">
                <button
                  type="button"
                  aria-expanded={!!expanded.layanan}
                  onClick={() => setExpanded((e) => ({ ...e, layanan: !e.layanan }))}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer min-h-[46px] text-sm whitespace-nowrap shrink-0"
                >
                  {expanded.layanan ? 'Tampilkan lebih sedikit' : `Lihat semua (${filteredServices.length})`}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Pusat Layanan Unggulan (Centers of Excellence) */}
        <section id="pusat-unggulan" className="py-16 sm:py-20 bg-slate-50 border-b border-slate-200 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center mb-14">
              <motion.div
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={VIEWPORT_CONFIG}
                transition={{ duration: 0.65, ease: EASE_OUT_EXPO }}
                className="lg:col-span-6 space-y-4"
              >
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0B3D91]">
                  CENTERS OF EXCELLENCE
                </p>
                <h2 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight text-balance">
                  Pusat Unggulan Spesialis &amp; Bedah Minimal Invasif
                </h2>
                <p className="text-slate-600 text-base leading-relaxed">
                  Dari Orthopedic &amp; Sports Center, Eye Center, Dental Center, Endoscopy &amp; Urology hingga Heart &amp; Brain Center yang didukung pencitraan CT-Scan 128 Slices dan Cath Lab siaga 24 jam.
                </p>
                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-slate-200">
                  <div className="p-2.5 -ml-2.5">
                    <p className="text-2xl font-extrabold text-[#0B3D91] font-mono tabular-nums">24+</p>
                    <p className="text-xs font-medium text-slate-600 mt-0.5">Poliklinik Spesialis</p>
                  </div>
                  <div className="p-2.5">
                    <p className="text-2xl font-extrabold text-[#0B3D91] font-mono tabular-nums">8</p>
                    <p className="text-xs font-medium text-slate-600 mt-0.5">Pusat Unggulan</p>
                  </div>
                  <div className="p-2.5">
                    <p className="text-2xl font-extrabold text-[#DC2626] font-mono tabular-nums">24/7</p>
                    <p className="text-xs font-medium text-slate-600 mt-0.5">IGD &amp; Lab Cito</p>
                  </div>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={VIEWPORT_CONFIG}
                transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
                className="lg:col-span-6"
              >
                <div className="group relative rounded-2xl overflow-hidden border border-slate-200 shadow-md bg-white aspect-[4/3]">
                  <img
                    src={excellenceSuiteImg}
                    alt="Ruang Diagnostik CT-Scan dan Kardiologi MYITARU"
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#061A3D]/85 via-[#061A3D]/35 to-transparent p-5 pt-12">
                    <p className="text-xs font-bold uppercase tracking-wider text-sky-200">
                      Teknologi Diagnostik &amp; Intervensi Modern
                    </p>
                    <p className="text-sm font-semibold text-white mt-0.5">
                      CT-Scan 128 Slices, Arthroscopy Suite &amp; Cath Lab Siaga 24 Jam
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
              {(expanded.unggulan ? CENTERS_OF_EXCELLENCE : CENTERS_OF_EXCELLENCE.slice(0, 4)).map((center, idx) => (
                <motion.div
                  key={center.id}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT_CONFIG}
                  transition={{ duration: 0.45, delay: Math.min(idx * 0.05, 0.25), ease: EASE_OUT_EXPO }}
                  whileHover={{ y: -5 }}
                  className="group bg-white rounded-2xl border border-slate-200 hover:border-[#0B3D91]/40 p-5 flex flex-col justify-between transition shadow-xs hover:shadow-md"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs font-semibold text-[#0B3D91] mb-2">
                      <span>{center.highlightMetric}</span>
                      <HeartPulse className="w-4 h-4 text-[#0B3D91] shrink-0" />
                    </div>
                    <h3 className="text-base font-extrabold text-slate-900 group-hover:text-[#0B3D91] transition-colors">
                      {center.title}
                    </h3>
                    <p className="text-xs font-medium text-slate-500 mt-0.5">{center.subtitle}</p>
                    <p className="text-xs text-slate-600 mt-3 leading-relaxed">{center.description}</p>

                    <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-3">
                      {center.services.map((srv) => (
                        <li key={srv} className="text-xs text-slate-700 flex items-start gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          <span>{srv}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-5 pt-4 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handlePresetBooking(center.poliKode, `Konsultasi ${center.title}`)}
                      className="text-xs font-bold text-[#0B3D91] hover:text-[#082D6E] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Daftar Layanan Ini</span>
                      <ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-1" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
            {CENTERS_OF_EXCELLENCE.length > 4 && (
              <div className="flex justify-center mt-8">
                <button
                  type="button"
                  aria-expanded={!!expanded.unggulan}
                  onClick={() => setExpanded((e) => ({ ...e, unggulan: !e.unggulan }))}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer min-h-[46px] text-sm whitespace-nowrap shrink-0"
                >
                  {expanded.unggulan ? 'Tampilkan lebih sedikit' : `Lihat semua (${CENTERS_OF_EXCELLENCE.length})`}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Section 5: Fasilitas Kamar Rawat Inap & Informasi Jam Besuk */}
        <section id="rawat-inap" className="py-16 sm:py-20 bg-white border-b border-slate-200 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-10">
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_CONFIG}
              transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
              className="max-w-2xl"
            >
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0B3D91]">
                FASILITAS RAWAT INAP &amp; HOSPITALITY
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                Pilihan Kelas Kamar Rawat Inap &amp; Jam Besuk Pasien
              </h2>
              <p className="text-sm text-slate-600 mt-2">
                Menunjang pemulihan pasien secara optimal dengan tata ruang tenang mulai dari Kelas Deluxe hingga Junior Suite serta pendampingan perawat 24 jam.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
              {/* Left Column: Photographic Showcase + Official Visiting Hours */}
              <div className="lg:col-span-6 flex flex-col justify-between gap-6">
                <div className="group relative rounded-2xl overflow-hidden border border-slate-200 shadow-md flex-1 min-h-[280px]">
                  <img
                    src={inpatientSuiteImg}
                    alt="Kamar Rawat Inap Executive Suite MYITARU"
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#061A3D]/90 via-[#061A3D]/40 to-transparent p-5 pt-12">
                    <p className="text-xs font-bold uppercase tracking-wider text-sky-300">
                      STANDAR KENYAMANAN RAWAT INAP
                    </p>
                    <p className="text-sm font-semibold text-white mt-0.5">
                      Kamar Perawatan Executive dengan Ruang Keluarga &amp; Nurse Call 24 Jam
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wider text-[#0B3D91]">
                        JADWAL KUNJUNGAN PASIEN
                      </p>
                      <h3 className="text-lg font-extrabold text-slate-900 mt-0.5">
                        Jam Besuk Rawat Inap Resmi
                      </h3>
                    </div>
                    <Clock className="w-5 h-5 text-[#0B3D91] shrink-0" />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="rounded-xl bg-white border border-slate-200 p-4">
                      <p className="text-xs font-semibold text-slate-500">Sesi Pagi</p>
                      <p className="text-lg font-extrabold font-mono tabular-nums text-[#0B3D91] mt-0.5">
                        {VISITING_HOURS_INFO.morningSession}
                      </p>
                    </div>
                    <div className="rounded-xl bg-white border border-slate-200 p-4">
                      <p className="text-xs font-semibold text-slate-500">Sesi Sore / Malam</p>
                      <p className="text-lg font-extrabold font-mono tabular-nums text-[#0B3D91] mt-0.5">
                        {VISITING_HOURS_INFO.eveningSession}
                      </p>
                    </div>
                  </div>

                  <ul className="space-y-1.5 text-xs text-slate-600 pt-1">
                    {VISITING_HOURS_INFO.rules.map((rule) => (
                      <li key={rule} className="flex items-start gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Right Column: Interactive Room Class Selector & Specifications */}
              <div className="lg:col-span-6 flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-5">
                <div className="space-y-3">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#0B3D91]">
                    PILIH TIPE KAMAR PERAWATAN
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {INPATIENT_ROOMS.map((room) => (
                      <button
                        key={room.id}
                        type="button"
                        onClick={() => setSelectedRoomId(room.id)}
                        className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                          room.id === selectedRoom.id
                            ? 'bg-[#0B3D91] text-white shadow-xs'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {room.name}
                      </button>
                    ))}
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    key={selectedRoom.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.25, ease: EASE_OUT_EXPO }}
                    className="bg-white rounded-2xl border border-slate-200 p-6 space-y-5 flex-1 flex flex-col justify-between"
                  >
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
                        <div>
                          <p className="text-xs font-semibold text-[#0B3D91]">
                            {selectedRoom.tierLabel} · {selectedRoom.capacity}
                          </p>
                          <h3 className="text-2xl font-extrabold text-slate-900 mt-0.5">
                            {selectedRoom.name}
                          </h3>
                        </div>
                        <div className="text-left sm:text-right">
                          <p className="text-[11px] font-semibold uppercase text-slate-500">
                            Tarif Estimasi / Malam
                          </p>
                          <p className="text-xl font-extrabold font-mono tabular-nums text-[#0B3D91]">
                            {formatRupiah(selectedRoom.pricePerNight)}
                          </p>
                        </div>
                      </div>

                      <p className="text-sm text-slate-600 leading-relaxed">{selectedRoom.summary}</p>

                      <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5">
                          Fasilitas di Dalam Kamar
                        </p>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {selectedRoom.amenities.map((item) => (
                            <li key={item} className="text-xs text-slate-700 flex items-start gap-2">
                              <BedDouble className="w-4 h-4 text-[#0B3D91] shrink-0 mt-0.5" />
                              <span>{item}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                      <span className="text-xs text-slate-500 font-medium">
                        Jam besuk: {selectedRoom.visitingHours}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handlePresetBooking(
                            'PDL',
                            `Informasi & Permintaan Ketersediaan Kamar Rawat Inap ${selectedRoom.name}`
                          )
                        }
                        className="inline-flex items-center gap-2 bg-[#0B3D91] hover:bg-[#082D6E] text-white text-xs font-bold px-5 py-3 rounded-xl transition cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>Tanyakan Ketersediaan Kamar</span>
                        <ArrowRight className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
          </div>
        </section>

        {/* Section 6: Promo Layanan Kesehatan, Fisioterapi Home Care & Paket Medical Check-Up */}
        <section id="promo-mcu" className="py-16 sm:py-20 bg-slate-50 border-b border-slate-200 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-14">
            {/* Featured Promos & Physiotherapy Home Care Spotlight */}
            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT_CONFIG}
                transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs"
              >
                <div className="lg:col-span-5 aspect-[4/3] lg:aspect-auto lg:h-full overflow-hidden">
                  <img
                    src={physiotherapyImg}
                    alt="Layanan Fisioterapi Eksklusif dan Home Care MYITARU"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="lg:col-span-7 p-6 sm:p-8 space-y-4">
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0B3D91]">
                    PROMO &amp; PROGRAM PEMULIHAN EKSKLUSIF
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                    Fisioterapi Home Care &amp; Skrining Kesehatan Berkala
                  </h2>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    Dapatkan kemudahan layanan fisioterapis bersertifikat langsung ke rumah Anda, paket deteksi dini jantung &amp; pembuluh darah, hingga program vaksinasi dewasa dengan penjadwalan online.
                  </p>
                  <div className="flex flex-wrap gap-3 pt-1">
                    <button
                      type="button"
                      onClick={() => handlePresetBooking('RHB', 'Pemesanan Layanan Fisioterapi Home Care')}
                      className="inline-flex items-center gap-2 bg-[#0B3D91] hover:bg-[#082D6E] text-white font-bold text-xs sm:text-sm px-5 py-3 rounded-xl transition cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>Pesan Fisioterapi Home Care</span>
                    </button>
                    <a
                      href="tel:02150988800"
                      className="inline-flex items-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs sm:text-sm px-5 py-3 rounded-xl transition whitespace-nowrap shrink-0"
                    >
                      <PhoneCall className="w-4 h-4 text-[#0B3D91]" />
                      <span>Hubungi (021) 5098-8800</span>
                    </a>
                  </div>
                </div>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                {HOSPITAL_PROMOS.map((promo, idx) => (
                  <motion.div
                    key={promo.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={VIEWPORT_CONFIG}
                    transition={{ duration: 0.4, delay: idx * 0.06, ease: EASE_OUT_EXPO }}
                    whileHover={{ y: -4 }}
                    className="bg-white rounded-2xl border border-slate-200 hover:border-[#0B3D91]/40 p-5 flex flex-col justify-between transition shadow-xs hover:shadow-md"
                  >
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B3D91]">
                        {promo.tag} · {promo.validUntil}
                      </p>
                      <h3 className="text-base font-extrabold text-slate-900 mt-1.5 leading-snug">
                        {promo.title}
                      </h3>
                      <p className="text-xs text-slate-600 mt-2 leading-relaxed">{promo.subtitle}</p>
                      <p className="text-xs font-semibold text-emerald-700 mt-3 pt-3 border-t border-slate-100">
                        {promo.benefit}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => handlePresetBooking(promo.poliKode, promo.presetNote)}
                      className="mt-4 w-full py-2.5 rounded-xl bg-slate-100 hover:bg-[#0B3D91] text-slate-900 hover:text-white font-bold text-xs transition cursor-pointer"
                    >
                      Ambil Promo Ini
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* MCU Transparent Packages */}
            <div>
              <motion.div
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={VIEWPORT_CONFIG}
                transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
                className="max-w-2xl mb-8"
              >
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0B3D91]">
                  PREVENTIVE &amp; DIAGNOSTIC PACKAGES
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                  Paket Medical Check-Up Transparan
                </h2>
                <p className="text-sm text-slate-600 mt-2">
                  Deteksi dini kondisi kesehatan Anda dengan hasil laboratorium &amp; radiologi tervalidasi yang langsung dapat diunduh di Aplikasi Pasien.
                </p>
              </motion.div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {MCU_PACKAGES.map((pkg, idx) => (
                  <motion.div
                    key={pkg.id}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={VIEWPORT_CONFIG}
                    transition={{ duration: 0.45, delay: idx * 0.08, ease: EASE_OUT_EXPO }}
                    whileHover={{ y: -6 }}
                    className={`rounded-2xl p-6 sm:p-7 flex flex-col justify-between bg-white border transition hover:shadow-lg ${
                      idx === 1 ? 'border-[#0B3D91] shadow-md' : 'border-slate-200 shadow-xs'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between text-xs font-semibold text-[#0B3D91]">
                        <span>{pkg.tier}</span>
                        <span className="font-mono tabular-nums text-slate-500">{pkg.duration}</span>
                      </div>
                      <h3 className="text-xl font-extrabold text-slate-900 mt-2">{pkg.name}</h3>
                      <p className="text-2xl font-extrabold text-[#0B3D91] font-mono tabular-nums mt-3">
                        {formatRupiah(pkg.price)}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {pkg.recommendedFor} · {pkg.fastingRequired ? 'Perlu Puasa 10 Jam' : 'Tanpa Puasa'}
                      </p>

                      <ul className="mt-5 pt-5 border-t border-slate-100 space-y-2.5">
                        {pkg.highlights.map((item) => (
                          <li key={item} className="text-sm text-slate-700 flex items-start gap-2.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <motion.button
                      type="button"
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handlePresetBooking('MCU', `Pendaftaran ${pkg.name}`)}
                      className={`mt-6 w-full py-3 rounded-xl font-bold text-sm transition cursor-pointer min-h-[44px] ${
                        idx === 1
                          ? 'bg-[#0B3D91] hover:bg-[#082D6E] text-white'
                          : 'bg-slate-100 hover:bg-slate-200 text-slate-900'
                      }`}
                    >
                      Pesan Paket MCU
                    </motion.button>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Section 7: Aplikasi Mobile Pasien */}
        <section className="py-16 sm:py-20 bg-[#0B3D91] text-white overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              <motion.div
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={VIEWPORT_CONFIG}
                transition={{ duration: 0.65, ease: EASE_OUT_EXPO }}
                className="lg:col-span-7 space-y-5"
              >
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-300">
                  APLIKASI MOBILE PASIEN MYITARU
                </p>
                <h2 className="text-2xl sm:text-4xl font-extrabold leading-tight text-balance">
                  Cek Antrean Poli, Jadwal Dokter &amp; Hasil Lab Langsung Dari Ponsel
                </h2>
                <p className="text-blue-100 text-base leading-relaxed max-w-2xl">
                  Dirancang ringan sebagai aplikasi mobile yang dapat dipasang langsung ke layar utama ponsel Anda. Verifikasi cepat dan aman melalui dua pilihan akses pasien:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                  <motion.div
                    whileHover={{ y: -3 }}
                    className="rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 p-4 transition"
                  >
                    <p className="font-bold text-white flex items-center gap-2 text-sm">
                      <UserCheck className="w-4 h-4 text-sky-300" />
                      Masuk dengan Akun Google
                    </p>
                    <p className="text-xs text-blue-100 mt-1.5 leading-relaxed">
                      Satu ketukan melalui autentikasi Google terenkripsi untuk memantau seluruh kunjungan keluarga.
                    </p>
                  </motion.div>

                  <motion.div
                    whileHover={{ y: -3 }}
                    className="rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 p-4 transition"
                  >
                    <p className="font-bold text-white flex items-center gap-2 text-sm">
                      <ShieldCheck className="w-4 h-4 text-sky-300" />
                      Verifikasi No. RM + Tanggal Lahir
                    </p>
                    <p className="text-xs text-blue-100 mt-1.5 leading-relaxed">
                      Tanpa perlu membuat kata sandi baru. Cukup masukkan Nomor Rekam Medis &amp; tanggal lahir Anda.
                    </p>
                  </motion.div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-3">
                  <motion.button
                    type="button"
                    whileHover={{ y: -2 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate('/mobile')}
                    className="group inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-[#0B3D91] font-bold px-6 py-3.5 rounded-xl transition cursor-pointer min-h-[48px] text-sm"
                  >
                    <Smartphone className="w-4 h-4" />
                    <span>Buka App Mobile Pasien</span>
                    <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                  </motion.button>

                  <PWAInstallButton
                    variant="outline"
                    label="Pasang ke Layar Utama"
                    showAlwaysGuide
                    className="bg-transparent border-white/40 text-white hover:bg-white/15"
                  />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, scale: 0.94, y: 20 }}
                whileInView={{ opacity: 1, scale: 1, y: 0 }}
                viewport={VIEWPORT_CONFIG}
                transition={{ duration: 0.7, ease: EASE_OUT_EXPO }}
                className="lg:col-span-5"
              >
                <div className="group relative rounded-2xl overflow-hidden border border-white/20 shadow-2xl aspect-square max-w-md mx-auto">
                  <img
                    src={mobileLifestyleImg}
                    alt="Pasien mengakses antrean dan layanan MYITARU lewat ponsel"
                    className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                  />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#051430]/90 via-[#051430]/40 to-transparent p-5 pt-12">
                    <p className="text-xs font-bold uppercase tracking-wider text-sky-300">
                      MYITARU PASIEN MOBILE
                    </p>
                    <p className="text-sm font-semibold text-white mt-0.5">
                      Notifikasi Panggilan Poli &amp; Hasil Lab Real-Time
                    </p>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Section 8: Mitra Asuransi & Penjamin Resmi */}
        <section id="mitra-asuransi" className="py-14 sm:py-16 bg-slate-50 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0B3D91]">
                  PENJAMINAN &amp; KEMITRAAN RESMI
                </p>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                  Mitra Asuransi, BPJS Kesehatan &amp; Perusahaan
                </h2>
                <p className="text-sm text-slate-600 mt-1">
                  Mendukung pelayanan cashless maupun penjaminan JKN-KIS dengan verifikasi eligibilitas cepat di loket pendaftaran.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {(['Semua', 'JKN / Pemerintah', 'Asuransi Swasta', 'Korporasi & TPA'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setInsuranceFilter(t)}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      insuranceFilter === t
                        ? 'bg-[#0B3D91] text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {(expanded.mitra ? filteredInsurances : filteredInsurances.slice(0, 6)).map((partner) => (
                <div
                  key={partner.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-col justify-between gap-2 hover:border-[#0B3D91]/40 transition"
                >
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#0B3D91]">
                      {partner.type}
                    </p>
                    <h3 className="font-extrabold text-sm text-slate-900 mt-1">{partner.name}</h3>
                  </div>
                  <p className="text-xs text-slate-600 pt-2 border-t border-slate-100">
                    {partner.coverageNote}
                  </p>
                </div>
              ))}
            </div>
            {filteredInsurances.length > 6 && (
              <div className="flex justify-center">
                <button
                  type="button"
                  aria-expanded={!!expanded.mitra}
                  onClick={() => setExpanded((e) => ({ ...e, mitra: !e.mitra }))}
                  className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer min-h-[46px] text-sm whitespace-nowrap shrink-0"
                >
                  {expanded.mitra ? 'Tampilkan lebih sedikit' : `Lihat semua (${filteredInsurances.length})`}
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Section 9: Healthpedia & Cerita Pemulihan Pasien */}
        <section id="artikel" className="py-16 sm:py-20 bg-white border-b border-slate-200 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-7 space-y-6">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT_CONFIG}
                  transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0B3D91]">
                    HEALTHPEDIA &amp; PANDUAN PASIEN
                  </p>
                  <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                    Edukasi Medis Terverifikasi Dokter
                  </h2>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT_CONFIG}
                  transition={{ duration: 0.55, ease: EASE_OUT_EXPO }}
                  whileHover={{ y: -4 }}
                  className="group grid grid-cols-1 sm:grid-cols-12 gap-6 items-center rounded-2xl border border-slate-200 hover:border-[#0B3D91]/40 hover:shadow-md p-4 bg-slate-50 transition"
                >
                  <div className="sm:col-span-5 aspect-[4/3] rounded-xl overflow-hidden">
                    <img
                      src={doctorConsultImg}
                      alt="Konsultasi Dokter Spesialis MYITARU"
                      className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
                    />
                  </div>
                  <div className="sm:col-span-7 space-y-2">
                    <span className="text-xs font-bold text-[#0B3D91]">
                      {HEALTH_ARTICLES[0].category} · {HEALTH_ARTICLES[0].readMinutes} Menit Baca
                    </span>
                    <h3 className="text-lg font-bold text-slate-900 leading-snug group-hover:text-[#0B3D91] transition-colors">
                      {HEALTH_ARTICLES[0].title}
                    </h3>
                    <p className="text-sm text-slate-600">{HEALTH_ARTICLES[0].summary}</p>
                    <button
                      type="button"
                      onClick={() => setActiveArticle(HEALTH_ARTICLES[0])}
                      className="inline-flex items-center gap-1.5 text-sm font-bold text-[#0B3D91] pt-1 cursor-pointer"
                    >
                      <span>Baca Panduan Lengkap</span>
                      <ArrowRight className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </button>
                  </div>
                </motion.div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {HEALTH_ARTICLES.slice(1).map((article, idx) => (
                    <motion.div
                      key={article.id}
                      initial={{ opacity: 0, y: 16 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={VIEWPORT_CONFIG}
                      transition={{ duration: 0.45, delay: idx * 0.08, ease: EASE_OUT_EXPO }}
                      whileHover={{ y: -4 }}
                      className="group rounded-2xl border border-slate-200 p-5 bg-white hover:border-[#0B3D91]/40 hover:shadow-md transition flex flex-col justify-between"
                    >
                      <div>
                        <p className="text-xs font-semibold text-[#0B3D91]">
                          {article.category} · {article.readMinutes} Mnt
                        </p>
                        <h4 className="font-bold text-sm text-slate-900 mt-1.5 leading-snug group-hover:text-[#0B3D91] transition-colors">
                          {article.title}
                        </h4>
                        <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                          {article.summary}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveArticle(article)}
                        className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#0B3D91] cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>Baca Artikel</span>
                      </button>
                    </motion.div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-5 space-y-5">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT_CONFIG}
                  transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
                >
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0B3D91]">
                    PENGALAMAN PASIEN
                  </p>
                  <h2 className="text-2xl font-extrabold text-slate-900 mt-1">
                    Kisah Pemulihan &amp; Kepercayaan
                  </h2>
                </motion.div>

                <div className="space-y-4">
                  {PATIENT_STORIES.map((story, idx) => (
                    <motion.div
                      key={story.id}
                      initial={{ opacity: 0, x: 18 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={VIEWPORT_CONFIG}
                      transition={{ duration: 0.45, delay: idx * 0.08, ease: EASE_OUT_EXPO }}
                      whileHover={{ y: -3 }}
                      className="rounded-2xl border border-slate-200 bg-slate-50 hover:bg-white hover:border-[#0B3D91]/30 hover:shadow-xs p-5 space-y-2.5 transition"
                    >
                      <p className="text-xs font-bold text-[#0B3D91]">
                        {story.unit} · {story.patientInitials}
                      </p>
                      <p className="text-sm text-slate-700 leading-relaxed">“{story.quote}”</p>
                      <p className="text-xs font-semibold text-emerald-700">{story.outcome}</p>
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 10: Jaringan Lokasi Cabang & Kontak Resmi */}
        <section id="cabang" className="py-14 sm:py-16 bg-slate-50 border-b border-slate-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT_CONFIG}
              transition={{ duration: 0.5, ease: EASE_OUT_EXPO }}
            >
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#0B3D91]">
                JARINGAN FASILITAS KESEHATAN
              </p>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 mt-1">
                Lokasi, Kontak Customer Relations &amp; Jam Layanan
              </h2>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {HOSPITAL_BRANCHES.map((branch, idx) => (
                <motion.div
                  key={branch.id}
                  initial={{ opacity: 0, y: 18 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={VIEWPORT_CONFIG}
                  transition={{ duration: 0.45, delay: idx * 0.08, ease: EASE_OUT_EXPO }}
                  whileHover={{ y: -4 }}
                  className="bg-white rounded-2xl border border-slate-200 hover:border-[#0B3D91]/40 p-6 space-y-3 shadow-xs hover:shadow-md transition"
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-[#0B3D91]">
                    {branch.city} · {branch.accreditation}
                  </p>
                  <h3 className="font-bold text-base text-slate-900">{branch.name}</h3>
                  <p className="text-xs text-slate-600 flex items-start gap-2 leading-relaxed">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                    <span>{branch.address}</span>
                  </p>
                  <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    <p>{branch.hours}</p>
                    <p className="font-mono tabular-nums font-semibold text-slate-900">
                      Janji Temu: {branch.appointmentPhone} · WhatsApp: {branch.whatsappPhone}
                    </p>
                    <p className="font-mono tabular-nums font-bold text-[#DC2626]">
                      IGD &amp; Ambulans 24 Jam: {branch.emergencyPhone}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Patient-Only Corporate Footer (tanpa tautan ke aplikasi inti) */}
        <footer className="bg-[#07265C] text-white pt-14 pb-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-8 pb-10 border-b border-white/10">
              <div className="md:col-span-5 space-y-3">
                <div className="flex items-center gap-2.5">
                  <BrandLogo alt="MYITARU" className="w-9 h-9 rounded-xl object-cover" />
                  <span className="font-extrabold text-lg tracking-tight">
                    MYITARU SIMK
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-blue-200 leading-relaxed max-w-md">
                  Layanan kesehatan dan rawat inap 24 jam berstandar keselamatan pasien KARS Paripurna, terintegrasi pendaftaran online, antrean real-time, BPJS Kesehatan, dan SatuSehat Kemenkes RI.
                </p>
                <p className="text-xs text-sky-200 font-medium">
                  Jam Besuk Rawat Inap: Pagi {VISITING_HOURS_INFO.morningSession} · Sore{' '}
                  {VISITING_HOURS_INFO.eveningSession}
                </p>
              </div>

              <div className="md:col-span-4 space-y-2.5 text-xs">
                <p className="font-bold uppercase tracking-wider text-sky-300">Navigasi Layanan</p>
                <div className="grid grid-cols-2 gap-2 text-blue-100">
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace('daftar', 'portal-workspace')}
                    className="text-left hover:text-white cursor-pointer"
                  >
                    Pendaftaran Online
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace('antrean', 'portal-workspace')}
                    className="text-left hover:text-white cursor-pointer"
                  >
                    Cek Nomor Antrean
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace(undefined, 'layanan-medis')}
                    className="text-left hover:text-white cursor-pointer"
                  >
                    Layanan Kesehatan
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace(undefined, 'pusat-unggulan')}
                    className="text-left hover:text-white cursor-pointer"
                  >
                    Pusat Unggulan
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace(undefined, 'rawat-inap')}
                    className="text-left hover:text-white cursor-pointer"
                  >
                    Kamar Rawat Inap
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace(undefined, 'promo-mcu')}
                    className="text-left hover:text-white cursor-pointer"
                  >
                    Promo &amp; Paket MCU
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollToWorkspace(undefined, 'mitra-asuransi')}
                    className="text-left hover:text-white cursor-pointer"
                  >
                    Mitra Asuransi
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/mobile')}
                    className="text-left hover:text-white cursor-pointer"
                  >
                    Aplikasi Mobile Pasien
                  </button>
                </div>
              </div>

              <div className="md:col-span-3 space-y-2.5 text-xs">
                <p className="font-bold uppercase tracking-wider text-sky-300">Kontak Darurat &amp; Info</p>
                <p className="font-mono tabular-nums text-base font-extrabold text-white">
                  IGD 24 Jam: 1-500-911
                </p>
                <p className="text-blue-200">Pendaftaran Telepon: (021) 5098-8800</p>
                <p className="text-blue-200">WhatsApp Customer Relations: 0811-1500-911</p>
                <p className="text-blue-200">Jl. Kesehatan Raya No. 88, Jakarta Pusat</p>
              </div>
            </div>

            <div className="pt-6 flex flex-wrap items-center justify-between gap-3 text-[11px] text-blue-200/80">
              <span>
                © {new Date().getFullYear()} MYITARU SIMK · Portal Publik Layanan Pasien
              </span>
              <SystemCopyrightFooterBadge />
            </div>
          </div>
        </footer>

        {/* Healthpedia Article Reader Modal */}
        <AnimatePresence>
          {activeArticle && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
              onClick={() => setActiveArticle(null)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ duration: 0.28, ease: EASE_OUT_EXPO }}
                className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200 p-6 sm:p-8 space-y-4"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-[#0B3D91]">
                      {activeArticle.category} · {activeArticle.readMinutes} Menit Baca
                    </p>
                    <h3 className="text-xl font-extrabold text-slate-900 mt-1 leading-snug">
                      {activeArticle.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {activeArticle.author} · {activeArticle.date}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveArticle(null)}
                    className="p-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                  {activeArticle.body.map((para, i) => (
                    <p key={i}>{para}</p>
                  ))}
                </div>

                <div className="pt-4 border-t border-slate-100 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveArticle(null);
                      scrollToWorkspace('daftar', 'portal-workspace');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-[#0B3D91] text-white text-xs font-bold cursor-pointer"
                  >
                    Buat Janji Dokter Terkait
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
};
