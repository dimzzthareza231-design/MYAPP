# Kebijakan Keamanan

## Versi yang didukung

Hanya branch `main` dan deployment Cloudflare yang aktif (`myitaru-public`, `myitaru-core`) yang menerima perbaikan keamanan.

## Melaporkan celah keamanan

**Jangan membuka issue publik untuk celah keamanan.** Laporkan secara pribadi melalui [GitHub Security Advisories](https://github.com/dimzzthareza231-design/MYAPP/security/advisories/new).

Sertakan:
- komponen yang terdampak (web publik, aplikasi inti, Worker, D1, dll.),
- langkah reproduksi dan dampak yang diperkirakan,
- versi/commit yang diuji.

Laporan akan dikonfirmasi dalam 7 hari. Mohon beri waktu perbaikan sebelum mengungkapkan detailnya ke publik.

## Ruang lingkup

MYITARU **belum siap produksi** dan tidak boleh menyimpan data pasien nyata. Keterbatasan yang sudah diketahui (rate limiter per isolate Worker, integrasi yang masih simulasi, portal karyawan prototipe) tercantum di bagian [Keamanan dan keterbatasan](README.md#keamanan-dan-keterbatasan) README dan tidak perlu dilaporkan ulang.
