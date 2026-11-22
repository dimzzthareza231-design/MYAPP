import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, Smartphone, UserCheck } from 'lucide-react';
import { motion } from 'motion/react';
import { PWAInstallButton } from '../../PWA/PWAInstallButton';
import { SectionHeading } from './SectionHeading';
import { EASE_OUT_EXPO, SECTION_IDS, VIEWPORT_CONFIG } from '../portalShared';
import mobileLifestyleImg from '../../../assets/images/patient_mobile_lifestyle.webp';

/** Promosi Aplikasi Pasien (PWA). */
export const MobileAppSection: React.FC = () => (
  <section
    id={SECTION_IDS.mobileApp}
    aria-labelledby="mobile-app-title"
    className="py-16 sm:py-20 bg-brand text-white overflow-hidden scroll-mt-20"
  >
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        <motion.div
          initial={{ opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={VIEWPORT_CONFIG}
          transition={{ duration: 0.65, ease: EASE_OUT_EXPO }}
          className="lg:col-span-7 space-y-5"
        >
          <SectionHeading
            id="mobile-app-title"
            inverted
            eyebrow="APLIKASI PASIEN"
            title="Cek Antrean, Jadwal Dokter & Hasil Pemeriksaan dari Ponsel"
            description="Aplikasi web ringan yang dapat dipasang ke layar utama ponsel. Masuk dengan salah satu cara berikut:"
          />

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <li className="rounded-2xl bg-white/10 border border-white/15 p-4">
              <p className="font-bold text-white flex items-center gap-2 text-sm">
                <UserCheck className="w-4 h-4 text-sky-200" aria-hidden="true" />
                Masuk dengan Akun Google
              </p>
              <p className="text-sm text-blue-100 mt-1.5 leading-relaxed">
                Autentikasi melalui akun Google untuk memantau kunjungan Anda.
              </p>
            </li>
            <li className="rounded-2xl bg-white/10 border border-white/15 p-4">
              <p className="font-bold text-white flex items-center gap-2 text-sm">
                <ShieldCheck className="w-4 h-4 text-sky-200" aria-hidden="true" />
                Verifikasi No. RM + Tanggal Lahir
              </p>
              <p className="text-sm text-blue-100 mt-1.5 leading-relaxed">
                Tanpa kata sandi baru. Cukup Nomor Rekam Medis dan tanggal lahir Anda.
              </p>
            </li>
          </ul>

          <div className="flex flex-wrap items-center gap-3 pt-3">
            <Link
              to="/mobile"
              className="group inline-flex items-center gap-2 bg-white hover:bg-slate-100 text-brand font-bold px-6 py-3.5 rounded-xl transition min-h-[48px] text-sm"
            >
              <Smartphone className="w-4 h-4" aria-hidden="true" />
              <span>Buka Aplikasi Pasien</span>
              <ArrowRight
                className="w-4 h-4 transition-transform duration-300 group-hover:translate-x-1"
                aria-hidden="true"
              />
            </Link>
            <PWAInstallButton
              variant="outline"
              label="Pasang ke Layar Utama"
              showAlwaysGuide
              className="bg-transparent border-white/40 text-white hover:bg-white/15"
            />
          </div>
        </motion.div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl overflow-hidden border border-white/20 shadow-2xl aspect-square max-w-md mx-auto">
            <img
              src={mobileLifestyleImg}
              alt="Pasien membuka Aplikasi Pasien MYITARU di ponsel"
              width={1024}
              height={1024}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  </section>
);
