# PM — cloudflare-migration
- Cerita: sebagai pemilik MYITARU, saya ingin web publik & aplikasi inti berjalan di Cloudflare dengan database D1.
- Sukses: kedua Worker merespons, health HEALTHY dengan mode d1, login staf & pendaftaran tersimpan di D1, API inti 404 dari Worker publik.
- Di luar cakupan: impor data (semua dummy), Firebase di Cloudflare, rate limiting terdistribusi, domain kustom.
