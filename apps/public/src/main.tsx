import React from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

// This entry point deliberately does not import the internal app, Firebase,
// clinical datasets, employee directory, or any authenticated API client.
function applicationUrl(path: string): string | undefined {
  try {
    const url = new URL(import.meta.env.VITE_MAIN_APP_URL || '');
    const local = import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(url.hostname);
    if (url.username || url.password || (url.protocol !== 'https:' && !local)) return;
    if (url.pathname !== '/' || url.search || url.hash) return;
    return new URL(path, url.origin).href;
  } catch { return; }
}
function PortalLink({ path, children }: { path: string; children: React.ReactNode }) {
  const href = applicationUrl(path);
  return href ? <a className="button" href={href} rel="noreferrer">{children}</a>
    : <span className="button disabled" aria-disabled="true" title="Alamat aplikasi belum dikonfigurasi">{children}</span>;
}
function Website() {
  const contact = import.meta.env.VITE_PUBLIC_CONTACT || 'Informasi kontak resmi akan ditambahkan oleh pengelola klinik.';
  return <>
    <header><a className="brand" href="#beranda">Klinik Tarumanagara<span>Informasi & layanan pasien</span></a><nav aria-label="Navigasi utama"><a href="#layanan">Layanan</a><a href="#jadwal">Jadwal</a><a href="#kontak">Kontak</a><PortalLink path="/staff/login">Masuk staf</PortalLink></nav></header>
    <main>
      <section className="hero" id="beranda"><div><p className="eyebrow">KLINIK TARUMANAGARA</p><h1>Informasi layanan kesehatan, lebih mudah dijangkau.</h1><p>Temukan informasi klinik di situs publik ini. Akses pendaftaran dan informasi pribadi melalui aplikasi pasien yang memerlukan login.</p><div className="actions"><PortalLink path="/mobile">Buka portal pasien</PortalLink><a className="secondary" href="#layanan">Lihat layanan</a></div></div><aside aria-label="Keamanan informasi"><span className="symbol" aria-hidden="true">+</span><h2>Data medis tetap pribadi</h2><p>Rekam medis, data pegawai, dan layanan operasional tidak ditampilkan di situs publik.</p></aside></section>
      <section id="layanan"><p className="eyebrow">INFORMASI LAYANAN</p><h2>Terhubung dengan layanan klinik</h2><div className="grid"><article><h3>Pendaftaran pasien</h3><p>Masuk ke portal pasien untuk melihat layanan pendaftaran yang sudah diaktifkan pengelola.</p></article><article><h3>Informasi kunjungan</h3><p>Informasi kunjungan pribadi hanya dapat diakses setelah identitas dan hak akses diverifikasi.</p></article><article><h3>Bantuan layanan</h3><p>Hubungi pengelola untuk informasi persyaratan, ketersediaan layanan, dan bantuan akun.</p></article></div></section>
      <section id="jadwal" className="panel"><h2>Jadwal dokter dan jam layanan</h2><p>Jadwal resmi belum dipublikasikan di situs ini. Silakan konfirmasi kepada klinik; situs ini tidak menampilkan jadwal atau ketersediaan yang disimulasikan.</p></section>
      <section id="kontak"><p className="eyebrow">HUBUNGI KLINIK</p><h2>Kontak dan informasi resmi</h2><p className="contact">{contact}</p><p>Jangan mengirim NIK, kata sandi, atau informasi medis melalui formulir publik.</p></section>
    </main><footer><span>Klinik Tarumanagara · Situs informasi publik</span><span>Untuk keadaan darurat, hubungi layanan darurat setempat.</span></footer>
  </>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Website /></React.StrictMode>);
