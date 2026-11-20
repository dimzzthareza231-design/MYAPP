# Checklist penerimaan — belum siap produksi otomatis

## Harus diverifikasi sebelum merge/release
- [ ] CI frozen install, typecheck API, kedua build frontend, build server, dan semua tes regresi lulus.
- [ ] Tinjau full-project typecheck modul lama; job non-blocking bukan izin mengabaikan error.
- [ ] Uji Firestore Rules menggunakan Emulator: anonim, staf aktif/nonaktif, self-profile escalation, pasien A/B, notifikasi, token perangkat, dan audit append-only.
- [ ] Uji login nyata di staging (email terverifikasi, Google, token kedaluwarsa/dicabut, akun disabled, profil hilang, aktivasi/nonaktif saat sesi berjalan).
- [ ] Tinjau isolasi role/unit/cabang dan pembatasan field klinis lebih rinci. Role staf saat ini masih memiliki akses baca pasien luas sesuai daftar role; ini belum model least-privilege final.
- [ ] Audit pemakaian localStorage langsung, seed/mock, identitas penandatangan, perhitungan billing, dan alur resep di modul lama.
- [ ] Migrasikan master poli/penjamin yang masih memakai system_data administrator-only; pengguna non-admin tidak mendapat fallback data palsu.
- [ ] Uji alur pendaftaran, pemeriksaan, resep, pembayaran, konkurensi, serta kehilangan koneksi dan restart.
- [ ] Implementasikan dan uji backup offsite + restore dengan RPO/RTO yang disepakati.
- [ ] Implementasikan MFA sebenarnya; tidak ada klaim MFA dari OTP demo.
- [ ] Selesaikan integrasi BPJS/SATUSEHAT/pembayaran melalui sandbox resmi dan audit log; jangan aktifkan dummy success.
- [ ] Validasi keselamatan klinis, dasar hukum/consent pemrosesan data, dan kebijakan retensi sebelum mengaktifkan AI.
- [ ] Verifikasi image container non-root, startup/shutdown, health check, runtime environment, build-time Firebase config, reverse proxy dan HTTPS.
- [ ] Domain/DNS, secret management, monitoring, distributed rate limits, dan prosedur rollback disetujui pemilik.

Tidak ada deploy, DNS, merge, perubahan database produksi, atau perubahan Firebase cloud rules yang dilakukan otomatis oleh branch ini.
