import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PUBLIC_STATIC_ROUTES,
  articleSlug,
  doctorSlug,
  filterDoctors,
  findDoctorBySlug,
  parsePracticeDays,
  slugify,
  toStringList
} from '../src/components/Portal/publicDirectory';
import {
  PUBLIC_SITE_URL,
  buildMapsDirectionsUrl,
  buildMapsEmbedUrl,
  toWhatsAppHref
} from '../src/data/hospitalPublicCatalog';
import type { LiveDoctor } from '../src/components/Portal/portalShared';

function doc(partial: Partial<LiveDoctor> & Pick<LiveDoctor, 'id' | 'nama'>): LiveDoctor {
  return { spesialis: '', poli: '', poli_id: 'P1', status: 'Aktif', ...partial };
}

describe('direktori dokter publik', () => {
  test('parsePracticeDays memahami rentang, daftar, dan catatan', () => {
    assert.deepEqual(parsePracticeDays('Senin - Jumat'), ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat']);
    assert.deepEqual(parsePracticeDays('Selasa, Kamis, Sabtu'), ['Selasa', 'Kamis', 'Sabtu']);
    assert.equal(parsePracticeDays('Senin - Minggu (Rotasi)').length, 7);
    assert.deepEqual(parsePracticeDays('Sabtu - Senin'), ['Senin', 'Sabtu', 'Minggu']);
    assert.deepEqual(parsePracticeDays(''), []);
    assert.deepEqual(parsePracticeDays('Sesuai perjanjian'), []);
  });

  test('slug dokter unik dan dapat ditemukan kembali', () => {
    const a = doc({ id: 'DR-01', nama: 'dr. Budi Santoso, Sp.A' });
    const b = doc({ id: 'DR-02', nama: 'dr. Budi Santoso, Sp.A' });
    assert.notEqual(doctorSlug(a), doctorSlug(b));
    assert.match(doctorSlug(a), /^[a-z0-9-]+$/);
    assert.equal(findDoctorBySlug([a, b], doctorSlug(b))?.id, 'DR-02');
    assert.equal(doctorSlug(doc({ id: 'X', nama: 'Y', slug: 'Profil Khusus' })), 'profil-khusus');
  });

  test('filter berdasarkan kata kunci, poli, dan hari', () => {
    const list = [
      doc({ id: '1', nama: 'dr. A', spesialis: 'Anak', poli_id: 'ANAK', hari: 'Senin, Rabu' }),
      doc({ id: '2', nama: 'dr. B', spesialis: 'Jantung', poli_id: 'JTG', hari: 'Selasa - Kamis' })
    ];
    assert.deepEqual(filterDoctors(list, { query: 'jantung' }).map((d) => d.id), ['2']);
    assert.deepEqual(filterDoctors(list, { poliId: 'ANAK' }).map((d) => d.id), ['1']);
    assert.deepEqual(filterDoctors(list, { day: 'Rabu' }).map((d) => d.id), ['1', '2']);
    assert.deepEqual(filterDoctors(list, { day: 'Senin', poliId: 'JTG' }), []);
    assert.equal(filterDoctors(list, { poliId: 'ALL', day: 'ALL' }).length, 2);
  });

  test('toStringList menerima array atau teks', () => {
    assert.deepEqual(toStringList(['Indonesia', ' Inggris ']), ['Indonesia', 'Inggris']);
    assert.deepEqual(toStringList('Indonesia, Jawa'), ['Indonesia', 'Jawa']);
    assert.deepEqual(toStringList(undefined), []);
  });

  test('slug artikel dari judul bila slug kosong', () => {
    assert.equal(articleSlug({ id: 'a1', title: 'Cegah DBD di Musim Hujan!' }), 'cegah-dbd-di-musim-hujan');
    assert.equal(slugify('Ãbc  Déf'), 'abc-def');
  });
});

describe('tautan lokasi & kontak', () => {
  test('petunjuk arah memakai koordinat bila ada, selain itu alamat; kosong bila tidak ada data', () => {
    const withCoords = buildMapsDirectionsUrl({ name: 'RS', address: 'Jl. X', city: 'Kota', latitude: -6.2, longitude: 106.8 });
    assert.equal(withCoords, 'https://www.google.com/maps/search/?api=1&query=-6.2%2C106.8');
    const withAddress = buildMapsDirectionsUrl({ name: 'RS A', address: 'Jl. Merdeka 1', city: 'Bandung' });
    assert.ok(withAddress.startsWith('https://www.google.com/maps/search/?api=1&query='));
    assert.ok(decodeURIComponent(withAddress).includes('Jl. Merdeka 1'));
    assert.equal(buildMapsDirectionsUrl({ name: 'RS', address: '', city: 'Kota' }), '');
  });

  test('peta tersemat hanya dengan koordinat', () => {
    assert.equal(buildMapsEmbedUrl({}), '');
    assert.ok(buildMapsEmbedUrl({ latitude: 1, longitude: 2 }).includes('output=embed'));
  });

  test('tautan WhatsApp mengubah awalan 0 menjadi 62', () => {
    assert.equal(toWhatsAppHref('0811-1234-5678'), 'https://wa.me/6281112345678');
    assert.equal(toWhatsAppHref(''), '');
  });
});

describe('sitemap & rute publik', () => {
  test('sitemap.xml memuat semua rute statis publik', () => {
    const xml = readFileSync('public/sitemap.xml', 'utf-8');
    for (const route of PUBLIC_STATIC_ROUTES) {
      assert.ok(xml.includes(`<loc>${PUBLIC_SITE_URL}${route.path}</loc>`), `sitemap tidak memuat ${route.path}`);
    }
  });

  test('setiap rute statis terdaftar di PublicApp', () => {
    const app = readFileSync('src/PublicApp.tsx', 'utf-8');
    for (const route of PUBLIC_STATIC_ROUTES) {
      assert.ok(app.includes(`path="${route.path}"`), `PublicApp tidak memuat rute ${route.path}`);
    }
  });
});
