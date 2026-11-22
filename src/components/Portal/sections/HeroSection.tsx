import React, { useEffect, useState } from 'react';
import { CalendarCheck, ChevronLeft, ChevronRight, Pause, Play, Search, Ticket } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { EASE_OUT_EXPO, SECTION_IDS, type PublicPoli, type WorkspaceMode } from '../portalShared';

import heroBuildingImg from '../../../assets/images/myitaru_building_hero.webp';
import campusDropoffImg from '../../../assets/images/myitaru_campus_dropoff.webp';
import lobbyMainImg from '../../../assets/images/myitaru_lobby_main.webp';
import lobbyApmImg from '../../../assets/images/myitaru_lobby_apm.webp';

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
  primaryActionMode: WorkspaceMode;
  primaryAnchor: string;
}

// Semua foto berukuran 1376×768 (WebP).
const HERO_IMAGE_WIDTH = 1376;
const HERO_IMAGE_HEIGHT = 768;
const AUTOPLAY_MS = 7000;

const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'slide-main',
    eyebrow: 'PORTAL PASIEN MYITARU',
    titlePrefix: 'Daftar Poliklinik dan',
    titleHighlight: 'Pantau Antrean dari Mana Saja.',
    description:
      'Lihat jadwal dokter, daftar kunjungan poliklinik secara online, dan periksa status nomor antrean Anda tanpa harus antre di loket.',
    image: heroBuildingImg,
    imageAlt: 'Gedung MYITARU',
    tabLabel: 'Pendaftaran Online',
    primaryActionLabel: 'Pendaftaran Online',
    primaryActionMode: 'daftar',
    primaryAnchor: SECTION_IDS.workspace
  },
  {
    id: 'slide-campus',
    eyebrow: 'AKSES FASILITAS',
    titlePrefix: 'Akses Kampus dan Area Drop-off',
    titleHighlight: 'untuk Kunjungan yang Lebih Mudah.',
    description: 'Siapkan kunjungan Anda: cek jadwal dokter dan informasi layanan sebelum berangkat.',
    image: campusDropoffImg,
    imageAlt: 'Area akses dan drop-off MYITARU',
    tabLabel: 'Akses Kampus',
    primaryActionLabel: 'Lihat Jadwal Dokter',
    primaryActionMode: 'daftar',
    primaryAnchor: SECTION_IDS.workspace
  },
  {
    id: 'slide-lobby',
    eyebrow: 'LOBI UTAMA',
    titlePrefix: 'Informasi dan Pendaftaran',
    titleHighlight: 'dalam Satu Portal.',
    description: 'Informasi layanan, pendaftaran, dan status antrean tersedia di halaman ini dan di Aplikasi Pasien.',
    image: lobbyMainImg,
    imageAlt: 'Lobi utama MYITARU',
    tabLabel: 'Lobi Utama',
    primaryActionLabel: 'Cek Nomor Antrean',
    primaryActionMode: 'antrean',
    primaryAnchor: SECTION_IDS.workspace
  },
  {
    id: 'slide-apm',
    eyebrow: 'PENDAFTARAN MANDIRI',
    titlePrefix: 'Pendaftaran Pasien',
    titleHighlight: 'yang Lebih Praktis.',
    description: 'Daftar sebelum datang, lalu tunjukkan bukti pendaftaran kepada petugas saat tiba.',
    image: lobbyApmImg,
    imageAlt: 'Area pendaftaran mandiri di lobi MYITARU',
    tabLabel: 'Pendaftaran Mandiri',
    primaryActionLabel: 'Mulai Pendaftaran',
    primaryActionMode: 'daftar',
    primaryAnchor: SECTION_IDS.bookingForm
  }
];

interface HeroSectionProps {
  doctorSearch: string;
  onDoctorSearchChange: (value: string) => void;
  selectedPoliId: string;
  onSelectPoli: (poliId: string) => void;
  poliklinikList: PublicPoli[];
  onGoTo: (mode: WorkspaceMode, anchorId: string) => void;
}

export const HeroSection: React.FC<HeroSectionProps> = ({
  doctorSearch,
  onDoctorSearchChange,
  selectedPoliId,
  onSelectPoli,
  poliklinikList,
  onGoTo
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [activeIdx, setActiveIdx] = useState(0);
  // Autoplay mati bila pengguna memilih reduced motion; selalu bisa dijeda manual.
  const [isPlaying, setIsPlaying] = useState(!prefersReducedMotion);
  const [isInteracting, setIsInteracting] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) setIsPlaying(false);
  }, [prefersReducedMotion]);

  useEffect(() => {
    if (!isPlaying || isInteracting) return;
    const timer = window.setInterval(() => {
      setActiveIdx((prev) => (prev + 1) % HERO_SLIDES.length);
    }, AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [isPlaying, isInteracting]);

  const slide = HERO_SLIDES[activeIdx];
  const goPrev = () => setActiveIdx((prev) => (prev - 1 + HERO_SLIDES.length) % HERO_SLIDES.length);
  const goNext = () => setActiveIdx((prev) => (prev + 1) % HERO_SLIDES.length);

  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden bg-brand-ink">
      <div
        className="relative min-h-[500px] lg:min-h-[570px] flex items-center overflow-hidden"
        aria-roledescription="carousel"
        aria-label="Sorotan layanan"
        onMouseEnter={() => setIsInteracting(true)}
        onMouseLeave={() => setIsInteracting(false)}
        onFocus={() => setIsInteracting(true)}
        onBlur={() => setIsInteracting(false)}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={slide.id}
            initial={{ opacity: 0.35, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0.25 }}
            transition={{ duration: 0.75, ease: EASE_OUT_EXPO }}
            className="absolute inset-0"
          >
            <img
              src={slide.image}
              alt={slide.imageAlt}
              width={HERO_IMAGE_WIDTH}
              height={HERO_IMAGE_HEIGHT}
              // Slide pertama adalah LCP: muat segera. Slide lain dimuat saat ditampilkan.
              loading={activeIdx === 0 ? 'eager' : 'lazy'}
              fetchPriority={activeIdx === 0 ? 'high' : 'auto'}
              decoding="async"
              className="w-full h-full object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-brand-night/95 via-brand/80 to-brand/25" />
          </motion.div>
        </AnimatePresence>

        <div className="relative z-10 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-14 sm:py-16 pb-28 sm:pb-32">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
            <div
              className="max-w-2xl"
              aria-live={isPlaying && !isInteracting ? 'off' : 'polite'}
              aria-roledescription="slide"
              aria-label={`${activeIdx + 1} dari ${HERO_SLIDES.length}`}
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={slide.id}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.45, ease: EASE_OUT_EXPO }}
                  className="space-y-5"
                >
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-sky-200">{slide.eyebrow}</p>

                  <h1
                    id="hero-title"
                    className="text-3xl sm:text-5xl font-extrabold text-white leading-[1.12] tracking-tight text-balance"
                  >
                    {slide.titlePrefix}{' '}
                    <span className="relative inline-block text-sky-200">
                      {slide.titleHighlight}
                      <span aria-hidden="true" className="block h-1 w-full bg-sky-400/70 rounded-full mt-1" />
                    </span>
                  </h1>

                  <p className="text-base sm:text-lg text-slate-100 leading-relaxed max-w-xl">{slide.description}</p>

                  <div className="flex flex-wrap items-center gap-3 pt-2">
                    <a
                      href={`#${slide.primaryAnchor}`}
                      onClick={() => onGoTo(slide.primaryActionMode, slide.primaryAnchor)}
                      className="inline-flex items-center justify-center gap-2 bg-white hover:bg-slate-100 text-brand font-bold px-6 py-3.5 rounded-xl shadow-lg transition min-h-[48px] text-sm sm:text-base whitespace-nowrap shrink-0"
                    >
                      <CalendarCheck className="w-5 h-5 shrink-0" aria-hidden="true" />
                      <span>{slide.primaryActionLabel}</span>
                    </a>
                    <a
                      href={`#${SECTION_IDS.workspace}`}
                      onClick={() => onGoTo('antrean', SECTION_IDS.workspace)}
                      className="inline-flex items-center justify-center gap-2 bg-white/15 hover:bg-white/25 border border-white/35 text-white font-semibold px-6 py-3.5 rounded-xl backdrop-blur-xs transition min-h-[48px] text-sm sm:text-base whitespace-nowrap shrink-0"
                    >
                      <Ticket className="w-5 h-5 shrink-0" aria-hidden="true" />
                      <span>Cek Nomor Antrean</span>
                    </a>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

            <div className="flex flex-col items-start lg:items-end gap-3 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Slide sebelumnya"
                  className="w-11 h-11 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white flex items-center justify-center transition cursor-pointer"
                >
                  <ChevronLeft className="w-5 h-5" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlaying((v) => !v)}
                  aria-label={isPlaying ? 'Jeda pergantian slide otomatis' : 'Putar pergantian slide otomatis'}
                  aria-pressed={!isPlaying}
                  className="w-11 h-11 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white flex items-center justify-center transition cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-5 h-5" aria-hidden="true" /> : <Play className="w-5 h-5" aria-hidden="true" />}
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Slide berikutnya"
                  className="w-11 h-11 rounded-xl bg-white/15 hover:bg-white/25 border border-white/25 text-white flex items-center justify-center transition cursor-pointer"
                >
                  <ChevronRight className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>

              <div className="flex flex-wrap gap-2" role="group" aria-label="Pilih slide">
                {HERO_SLIDES.map((s, idx) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setActiveIdx(idx)}
                    aria-current={idx === activeIdx ? 'true' : undefined}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer whitespace-nowrap shrink-0 ${
                      idx === activeIdx
                        ? 'bg-white text-brand shadow-xs'
                        : 'bg-white/10 text-white hover:bg-white/20 border border-white/25'
                    }`}
                  >
                    {s.tabLabel}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dok pencarian cepat */}
      <div className="relative z-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 pb-10">
        <form
          role="search"
          aria-label="Cari dokter atau poliklinik"
          onSubmit={(e) => {
            e.preventDefault();
            onGoTo('daftar', SECTION_IDS.workspace);
          }}
          className="bg-white rounded-2xl shadow-xl border border-slate-200 p-4 sm:p-6"
        >
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-end">
            <div className="lg:col-span-5">
              <label
                htmlFor="hero-doctor-search"
                className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5"
              >
                Cari Dokter / Poliklinik
              </label>
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" aria-hidden="true" />
                <input
                  id="hero-doctor-search"
                  type="search"
                  value={doctorSearch}
                  onChange={(e) => onDoctorSearchChange(e.target.value)}
                  placeholder="Contoh: Penyakit Dalam, Mata, atau nama dokter"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm focus:bg-white focus:border-brand transition outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
                />
              </div>
            </div>

            <div className="lg:col-span-3">
              <label
                htmlFor="hero-poli-select"
                className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5"
              >
                Poliklinik Tujuan
              </label>
              <select
                id="hero-poli-select"
                value={selectedPoliId}
                onChange={(e) => onSelectPoli(e.target.value)}
                className="w-full px-3.5 py-3 rounded-xl border border-slate-300 bg-slate-50 text-slate-900 text-sm focus:bg-white focus:border-brand transition outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
              >
                <option value="ALL">
                  {poliklinikList.length > 0 ? `Semua Poliklinik (${poliklinikList.length} Unit)` : 'Semua Poliklinik'}
                </option>
                {poliklinikList.map((poli) => (
                  <option key={poli.id} value={poli.id}>
                    {poli.nama}
                  </option>
                ))}
              </select>
            </div>

            <div className="lg:col-span-4 grid grid-cols-2 gap-2.5">
              <button
                type="submit"
                className="bg-brand hover:bg-brand-hover text-white font-bold py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 cursor-pointer min-h-[46px] text-sm whitespace-nowrap shrink-0"
              >
                <Search className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Cari &amp; Daftar</span>
              </button>
              <a
                href={`#${SECTION_IDS.workspace}`}
                onClick={() => onGoTo('antrean', SECTION_IDS.workspace)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-bold py-3 px-4 rounded-xl transition flex items-center justify-center gap-2 min-h-[46px] text-sm whitespace-nowrap shrink-0"
              >
                <Ticket className="w-4 h-4 shrink-0 text-brand" aria-hidden="true" />
                <span>Cek Antrean</span>
              </a>
            </div>
          </div>
        </form>
      </div>
    </section>
  );
};
