# Checklist penerimaan — tidak otomatis siap produksi

- [ ] Frozen install, typecheck API, full-project typecheck, kedua build frontend, build server, dan semua tes regresi lulus untuk commit terbaru.
- [ ] Uji Firestore Rules di Emulator: anonim, akun aktif/nonaktif, self-profile escalation, pasien A/B, notifikasi, token perangkat dan audit append-only.
- [ ] Uji login nyata di staging: email/Google, token kedaluwarsa/dicabut, akun disabled, profil hilang, perubahan aktivasi saat sesi berjalan.
- [ ] Persempit akses per field/unit/cabang; daftar role staf saat ini masih memiliki akses baca pasien luas dan bukan least-privilege final.
- [ ] Audit localStorage langsung, seed/mock, penandatangan, perhitungan billing dan alur resep di modul lama.
- [ ] Migrasikan master poli/penjamin dari system_data administrator-only; jangan memakai fallback data palsu untuk non-admin.
- [ ] Uji pendaftaran → pemeriksaan → resep → pembayaran, konkurensi, koneksi terputus dan restart.
- [ ] Implementasikan serta uji backup offsite + restore dengan RPO/RTO yang disepakati.
- [ ] Implementasikan MFA sebenarnya; tidak ada klaim MFA dari OTP demo.
- [ ] Integrasikan BPJS/SATUSEHAT/pembayaran lewat sandbox resmi, audit dan idempotensi yang benar.
- [ ] Validasi keselamatan klinis, dasar hukum/consent dan retensi sebelum mengaktifkan AI.
- [ ] Verifikasi container non-root, build args Firebase web, runtime environment, startup/shutdown, health check dan HTTPS/reverse proxy.
- [ ] Setujui domain/DNS, secret management, monitoring, distributed rate limits dan rollback.

Branch ini tidak melakukan merge, deploy, DNS, migrasi data produksi, atau perubahan Firebase cloud rules.
