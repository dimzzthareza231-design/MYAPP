import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { MotionConfig } from 'motion/react';
import toast from 'react-hot-toast';
import {
  CENTERS_OF_EXCELLENCE,
  HEALTH_ARTICLES,
  HOSPITAL_BRANCHES,
  HOSPITAL_PROMOS,
  HOSPITAL_SERVICES,
  INPATIENT_ROOMS,
  INSURANCE_PARTNERS,
  MCU_PACKAGES,
  PATIENT_STORIES,
  VISITING_HOURS_INFO
} from '../../data/hospitalPublicCatalog';
import {
  BOOKING_CODE_LENGTH,
  SECTION_IDS,
  normalizeBookingCode,
  scrollToId,
  todayIso,
  type BookingFormState,
  type BookingSuccess,
  type LiveDoctor,
  type PoliQueueSnapshot,
  type PublicPoli,
  type QueueLookupMatch,
  type RecentTicketSummary,
  type WorkspaceMode
} from './portalShared';
import { TopInfoBar } from './sections/TopInfoBar';
import { SiteHeader, type PortalNavItem } from './sections/SiteHeader';
import { HeroSection } from './sections/HeroSection';
import { PatientWorkspace } from './sections/PatientWorkspace';
import { DoctorDirectory } from './sections/DoctorDirectory';
import { BookingPanel } from './sections/BookingPanel';
import { QueueLookupPanel } from './sections/QueueLookupPanel';
import { ServicesSection } from './sections/ServicesSection';
import { CentersSection } from './sections/CentersSection';
import { InpatientSection } from './sections/InpatientSection';
import { PromoMcuSection } from './sections/PromoMcuSection';
import { MobileAppSection } from './sections/MobileAppSection';
import { InsuranceSection } from './sections/InsuranceSection';
import { ArticlesSection } from './sections/ArticlesSection';
import { BranchesSection } from './sections/BranchesSection';
import { SiteFooter } from './sections/SiteFooter';
import { HOME_NAV_ITEMS } from './publicNav';
import { isPublicDoctor } from './publicDirectory';
import { useDocumentMeta } from './useDocumentMeta';

const RECENT_TICKETS_KEY = 'myitaru_public_recent_tickets';

const EMPTY_BOOKING_FORM: BookingFormState = {
  isExistingPatient: false,
  nama: '',
  tanggal_lahir: '',
  no_hp: '',
  tanggal: todayIso(),
  penjamin: 'Umum / Mandiri',
  keluhan: ''
};

const NAV_ITEMS = HOME_NAV_ITEMS;

const HOME_TITLE = 'MYITARU — Jadwal Dokter, Pendaftaran Online & Cek Antrean Pasien';
const HOME_DESCRIPTION =
  'Situs resmi pasien MYITARU: lihat jadwal dokter, daftar poliklinik secara online, cek nomor antrean, dan akses Aplikasi Pasien dari ponsel.';

export const PublicHospitalPortal: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useDocumentMeta(HOME_TITLE, HOME_DESCRIPTION);
  const [activeMode, setActiveMode] = useState<WorkspaceMode>('daftar');

  // Data jadwal & antrean hanya dari server; tidak ada data cadangan karangan.
  const [doctors, setDoctors] = useState<LiveDoctor[]>([]);
  const [poliklinikList, setPoliklinikList] = useState<PublicPoli[]>([]);
  const [poliQueues, setPoliQueues] = useState<PoliQueueSnapshot[]>([]);
  const [queueUpdatedAt, setQueueUpdatedAt] = useState('');
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [doctorSearch, setDoctorSearch] = useState('');
  const [selectedPoliId, setSelectedPoliId] = useState('ALL');
  const [selectedCategory, setSelectedCategory] = useState('Semua');
  const [showAllDoctors, setShowAllDoctors] = useState(false);

  const [selectedDoctor, setSelectedDoctor] = useState<LiveDoctor | null>(null);
  const [bookingForm, setBookingForm] = useState<BookingFormState>(EMPTY_BOOKING_FORM);
  const [isSubmittingBooking, setIsSubmittingBooking] = useState(false);
  const [bookingSuccess, setBookingSuccess] = useState<BookingSuccess | null>(null);

  const [recentTickets, setRecentTickets] = useState<RecentTicketSummary[]>(() => {
    try {
      const saved = localStorage.getItem(RECENT_TICKETS_KEY);
      const parsed: unknown = saved ? JSON.parse(saved) : [];
      // Tiket lama (sebelum ada kode booking) tidak bisa dicek lagi; abaikan.
      return Array.isArray(parsed)
        ? parsed.filter(
            (t): t is RecentTicketSummary =>
              !!t && typeof t.kode_booking === 'string' && t.kode_booking.length === BOOKING_CODE_LENGTH
          )
        : [];
    } catch {
      return [];
    }
  });

  const [queueQuery, setQueueQuery] = useState('');
  const [queueSearching, setQueueSearching] = useState(false);
  const [queueSearchedQuery, setQueueSearchedQuery] = useState('');
  const [queueMatches, setQueueMatches] = useState<QueueLookupMatch[]>([]);

  const fetchCatalogAndQueues = useCallback(async () => {
    setCatalogLoading(true);
    const problems: string[] = [];
    try {
      const [catalogRes, queueRes] = await Promise.allSettled([
        fetch('/api/public/hospital-catalog'),
        fetch('/api/public/queue-status')
      ]);

      if (catalogRes.status === 'fulfilled' && catalogRes.value.ok) {
        const catData = await catalogRes.value.json();
        if (Array.isArray(catData?.doctors)) setDoctors(catData.doctors.filter(isPublicDoctor));
        if (Array.isArray(catData?.poliklinik)) setPoliklinikList(catData.poliklinik);
      } else {
        problems.push('jadwal dokter');
      }

      if (queueRes.status === 'fulfilled' && queueRes.value.ok) {
        const qData = await queueRes.value.json();
        if (Array.isArray(qData?.poliQueues)) setPoliQueues(qData.poliQueues);
        if (qData?.updatedAt) setQueueUpdatedAt(qData.updatedAt);
      } else {
        problems.push('status antrean');
      }
    } catch {
      problems.push('jadwal dokter', 'status antrean');
    } finally {
      setCatalogError(
        problems.length > 0
          ? `Gagal memuat ${Array.from(new Set(problems)).join(' dan ')} terbaru. Data yang ditampilkan mungkin tidak terbaru.`
          : null
      );
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCatalogAndQueues();
  }, [fetchCatalogAndQueues]);

  // Dukung tautan langsung seperti /#cek-antrean atau /#formulir-pendaftaran.
  useEffect(() => {
    const applyHash = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ''));
      if (!id) return;
      if (id === SECTION_IDS.queue) setActiveMode('antrean');
      if (id === SECTION_IDS.bookingForm) setActiveMode('daftar');
      scrollToId(id);
    };
    applyHash();
    window.addEventListener('hashchange', applyHash);
    return () => window.removeEventListener('hashchange', applyHash);
  }, []);

  // "Buat Janji" dari profil dokter: /?dokter=<id>#formulir-pendaftaran → pilih dokter tsb.
  const requestedDoctorId = searchParams.get('dokter');
  useEffect(() => {
    if (!requestedDoctorId || doctors.length === 0) return;
    const doc = doctors.find((d) => d.id === requestedDoctorId);
    if (doc) {
      setSelectedDoctor(doc);
      setBookingSuccess(null);
      setActiveMode('daftar');
      scrollToId(SECTION_IDS.bookingForm);
    }
    // Bersihkan ?dokter= tanpa membuang #jangkar (agar tidak memicu gulir ke atas).
    const next = new URLSearchParams(searchParams);
    next.delete('dokter');
    const search = next.toString();
    navigate({ search: search ? `?${search}` : '', hash: window.location.hash }, { replace: true, preventScrollReset: true });
  }, [requestedDoctorId, doctors, searchParams, navigate]);

  // Pilih dokter pertama secara default setelah data dari server tersedia.
  useEffect(() => {
    if (!selectedDoctor && doctors.length > 0 && !requestedDoctorId) setSelectedDoctor(doctors[0]);
  }, [doctors, selectedDoctor, requestedDoctorId]);

  const categories = useMemo(() => {
    const cats = Array.from(new Set(poliklinikList.map((p) => p.kategori).filter((k): k is string => Boolean(k))));
    return cats.length > 0 ? ['Semua', ...cats] : [];
  }, [poliklinikList]);

  const filteredDoctors = useMemo(() => {
    const q = doctorSearch.trim().toLowerCase();
    return doctors.filter((doc) => {
      const matchesSearch =
        !q ||
        doc.nama.toLowerCase().includes(q) ||
        (doc.spesialis || '').toLowerCase().includes(q) ||
        (doc.poli || '').toLowerCase().includes(q) ||
        (doc.subspesialis || '').toLowerCase().includes(q);
      const matchesPoli = selectedPoliId === 'ALL' || doc.poli_id === selectedPoliId;
      if (!matchesSearch || !matchesPoli) return false;
      if (selectedCategory === 'Semua') return true;
      return poliklinikList.find((p) => p.id === doc.poli_id)?.kategori === selectedCategory;
    });
  }, [doctors, doctorSearch, selectedPoliId, selectedCategory, poliklinikList]);

  const goTo = useCallback((mode: WorkspaceMode | undefined, anchorId: string) => {
    if (mode) setActiveMode(mode);
    scrollToId(anchorId);
  }, []);

  const handleNavItem = useCallback(
    (item: PortalNavItem) => {
      goTo(item.mode, item.target);
    },
    [goTo]
  );

  const handleSelectDoctor = (doc: LiveDoctor) => {
    setSelectedDoctor(doc);
    setBookingSuccess(null);
    goTo('daftar', SECTION_IDS.bookingForm);
  };

  const handlePresetBooking = useCallback(
    (poliKode?: string, presetKeluhan?: string) => {
      const targetPoli = poliKode ? poliklinikList.find((p) => p.kode === poliKode) : undefined;
      const chosenDoc = (targetPoli ? doctors.find((d) => d.poli_id === targetPoli.id) : undefined) || doctors[0];
      if (targetPoli) {
        setSelectedPoliId(targetPoli.id);
        setSelectedCategory('Semua');
      }
      if (chosenDoc) setSelectedDoctor(chosenDoc);
      if (presetKeluhan) setBookingForm((prev) => ({ ...prev, keluhan: presetKeluhan }));
      setBookingSuccess(null);
      goTo('daftar', SECTION_IDS.bookingForm);
    },
    [poliklinikList, doctors, goTo]
  );

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctor) {
      toast.error('Silakan pilih poliklinik dan dokter tujuan.');
      return;
    }
    if (bookingForm.isExistingPatient) {
      // Pasien lama mendaftar melalui Aplikasi Pasien (butuh sesi terverifikasi).
      navigate('/mobile');
      return;
    }
    if (!bookingForm.nama.trim()) {
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
          tanggal_lahir: bookingForm.tanggal_lahir,
          no_hp: bookingForm.no_hp,
          poli_id: selectedDoctor.poli_id,
          poli_nama: selectedDoctor.poli,
          dokter_id: selectedDoctor.id,
          dokter_nama: selectedDoctor.nama,
          tanggal: bookingForm.tanggal,
          jam_praktek: selectedDoctor.jam || '',
          penjamin: bookingForm.penjamin,
          keluhan: bookingForm.keluhan
        })
      });

      const data = await res.json().catch(() => null);
      if (res.status === 409 && data?.code === 'DOCTOR_QUOTA_FULL') {
        toast.error('Kuota dokter pada tanggal tersebut sudah penuh. Silakan pilih tanggal lain atau dokter lain.', {
          duration: 6000
        });
        fetchCatalogAndQueues();
        return;
      }
      if (!res.ok || !data?.success) {
        toast.error(data?.message || 'Gagal memproses pendaftaran online.');
        return;
      }

      const ticket: RecentTicketSummary = {
        kode_booking: data.booking.kode_booking,
        nomor_antrian: data.booking.nomor_antrian,
        poli: data.booking.poli,
        dokter: data.booking.dokter,
        tanggal: data.booking.tanggal,
        jam_praktek: data.booking.jam_praktek
      };
      if (typeof ticket.kode_booking === 'string' && ticket.kode_booking) {
        const nextTickets = [ticket, ...recentTickets.filter((t) => t.kode_booking !== ticket.kode_booking)].slice(0, 5);
        setRecentTickets(nextTickets);
        try {
          localStorage.setItem(RECENT_TICKETS_KEY, JSON.stringify(nextTickets));
        } catch {
          // Abaikan kegagalan penyimpanan lokal.
        }
      }

      setBookingSuccess(data.booking);
      toast.success(`Pendaftaran berhasil. Simpan kode booking ${data.booking.kode_booking}.`);
      fetchCatalogAndQueues();
    } catch {
      toast.error('Koneksi ke server terganggu. Silakan coba beberapa saat lagi.');
    } finally {
      setIsSubmittingBooking(false);
    }
  };

  const handleQueueLookup = async (overrideQuery?: string) => {
    const q = normalizeBookingCode(overrideQuery ?? queueQuery);
    if (q.length !== BOOKING_CODE_LENGTH) {
      toast.error(`Masukkan kode booking ${BOOKING_CODE_LENGTH} karakter sesuai bukti pendaftaran Anda.`);
      return;
    }
    if (overrideQuery !== undefined) setQueueQuery(overrideQuery);
    setActiveMode('antrean');
    setQueueSearching(true);
    try {
      const res = await fetch(`/api/public/queue-status?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      if (res.ok && data?.success) {
        setQueueMatches(Array.isArray(data.matches) ? data.matches : []);
        setQueueSearchedQuery(data.query || q.toUpperCase());
        if (Array.isArray(data.poliQueues)) setPoliQueues(data.poliQueues);
        if (data.updatedAt) setQueueUpdatedAt(data.updatedAt);
      } else {
        toast.error(data?.message || 'Gagal memeriksa status antrean.');
      }
    } catch {
      toast.error('Gagal menghubungi layanan antrean.');
    } finally {
      setQueueSearching(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div id="top" className="min-h-screen bg-white text-slate-900 font-sans flex flex-col">
        <a
          href="#konten-utama"
          className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[60] focus:bg-white focus:text-brand focus:px-4 focus:py-2 focus:rounded-lg focus:shadow-lg"
        >
          Lewati ke konten utama
        </a>
        <TopInfoBar />
        <SiteHeader navItems={NAV_ITEMS} onNavigate={handleNavItem} />

        <main id="konten-utama" tabIndex={-1} className="outline-none">
          <HeroSection
            doctorSearch={doctorSearch}
            onDoctorSearchChange={setDoctorSearch}
            selectedPoliId={selectedPoliId}
            onSelectPoli={(id) => {
              setSelectedPoliId(id);
              setSelectedCategory('Semua');
            }}
            poliklinikList={poliklinikList}
            onGoTo={goTo}
          />

          <PatientWorkspace
            activeMode={activeMode}
            onModeChange={setActiveMode}
            catalogLoading={catalogLoading}
            catalogError={catalogError}
            onRetry={fetchCatalogAndQueues}
            bookingContent={
              <>
                <DoctorDirectory
                  categories={categories}
                  selectedCategory={selectedCategory}
                  onSelectCategory={(cat) => {
                    setSelectedCategory(cat);
                    setSelectedPoliId('ALL');
                  }}
                  filteredDoctors={filteredDoctors}
                  totalDoctors={doctors.length}
                  catalogLoading={catalogLoading}
                  showAll={showAllDoctors}
                  onToggleShowAll={() => setShowAllDoctors((v) => !v)}
                  selectedDoctorId={selectedDoctor?.id ?? null}
                  onSelectDoctor={handleSelectDoctor}
                  onResetFilters={() => {
                    setDoctorSearch('');
                    setSelectedPoliId('ALL');
                    setSelectedCategory('Semua');
                  }}
                />
                <BookingPanel
                  selectedDoctor={selectedDoctor}
                  bookingForm={bookingForm}
                  onFormChange={(patch) => setBookingForm((prev) => ({ ...prev, ...patch }))}
                  isSubmitting={isSubmittingBooking}
                  bookingSuccess={bookingSuccess}
                  onSubmit={handleBookingSubmit}
                  onCheckQueue={(kode) => {
                    handleQueueLookup(kode);
                    scrollToId(SECTION_IDS.queue);
                  }}
                  onReset={() => setBookingSuccess(null)}
                />
              </>
            }
            queueContent={
              <QueueLookupPanel
                queueQuery={queueQuery}
                onQueryChange={(v) => setQueueQuery(normalizeBookingCode(v))}
                onLookup={handleQueueLookup}
                searching={queueSearching}
                searchedQuery={queueSearchedQuery}
                matches={queueMatches}
                recentTickets={recentTickets}
                poliQueues={poliQueues}
                queueUpdatedAt={queueUpdatedAt}
                catalogLoading={catalogLoading}
                onRefresh={() => {
                  fetchCatalogAndQueues();
                  if (queueSearchedQuery) handleQueueLookup(queueSearchedQuery);
                }}
              />
            }
          />

          <ServicesSection services={HOSPITAL_SERVICES} onBook={handlePresetBooking} />
          <CentersSection centers={CENTERS_OF_EXCELLENCE} onBook={handlePresetBooking} />
          <InpatientSection
            rooms={INPATIENT_ROOMS}
            visitingHours={VISITING_HOURS_INFO}
            onAskAvailability={(roomName) =>
              handlePresetBooking(undefined, `Informasi ketersediaan kamar rawat inap ${roomName}`)
            }
          />
          <PromoMcuSection promos={HOSPITAL_PROMOS} packages={MCU_PACKAGES} onBook={handlePresetBooking} />
          <MobileAppSection />
          <InsuranceSection partners={INSURANCE_PARTNERS} />
          <ArticlesSection articles={HEALTH_ARTICLES} stories={PATIENT_STORIES} />
          <BranchesSection branches={HOSPITAL_BRANCHES} />
        </main>

        <SiteFooter navItems={NAV_ITEMS} onNavigate={handleNavItem} />
      </div>
    </MotionConfig>
  );
};

export default PublicHospitalPortal;
