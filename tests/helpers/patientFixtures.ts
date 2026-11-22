// Fixture pasien untuk pengujian. Pasien dibuat lewat API staf (persis seperti pendaftaran nyata),
// lalu sesi pasien diterbitkan lewat mesin sesi yang sama dengan yang akan dipakai login OTP.
import { issuePatientSession } from '../../src/server/patientPortalService';

export interface TestPatient {
  id: string;
  no_rm: string;
  nama: string;
  tanggal_lahir: string;
}

let counter = 0;

export async function createTestPatient(
  coreBaseUrl: string,
  staffToken: string,
  overrides: Record<string, unknown> = {}
): Promise<TestPatient> {
  counter += 1;
  const res = await fetch(`${coreBaseUrl}/api/v1/patients`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` },
    body: JSON.stringify({
      nama: `Pasien Uji ${counter}`,
      tanggal_lahir: '1985-04-23',
      jenis_kelamin: 'P',
      alamat: 'Alamat Uji',
      ...overrides
    })
  });
  const body = await res.json() as { data?: TestPatient };
  if (res.status !== 201 || !body.data) {
    throw new Error(`Gagal membuat fixture pasien (HTTP ${res.status}).`);
  }
  return body.data;
}

/** Sesi pasien untuk No. RM yang dianggap sudah lolos verifikasi identitas. */
export function createTestPatientSession(noRm: string): string {
  return issuePatientSession(noRm, 'otp');
}

export interface TestDoctor {
  id: string;
  nama: string;
  poli_id: string;
  poli: string;
  jam: string;
  kuota: number;
}

/**
 * Membuat poliklinik + dokter lewat API master staf (aplikasi inti). Tidak ada data dokter
 * bawaan di repo, sehingga setiap pengujian booking menyiapkan katalognya sendiri.
 */
export async function createTestDoctor(
  coreBaseUrl: string,
  staffToken: string,
  overrides: { kuota?: number; kode?: string } = {}
): Promise<TestDoctor> {
  counter += 1;
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${staffToken}` };
  const kode = overrides.kode ?? `T${String(counter).padStart(3, '0')}${Math.floor(Math.random() * 90 + 10)}`;
  const poliRes = await fetch(`${coreBaseUrl}/api/v1/master/poliklinik`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ kode, nama: `Poli Uji ${kode}`, kategori: 'Uji', kapasitas: 50 })
  });
  const poli = (await poliRes.json() as { data?: { id: string; nama: string } }).data;
  if (poliRes.status !== 201 || !poli) throw new Error(`Gagal membuat poliklinik uji (HTTP ${poliRes.status}).`);
  const docRes = await fetch(`${coreBaseUrl}/api/v1/master/doctors`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      nama: `dr. Dokter Uji ${counter}`,
      spesialis: 'Dokter Umum',
      poli_id: poli.id,
      hari: 'Senin - Minggu',
      jam: '08:00 - 12:00',
      kuota: overrides.kuota ?? 30,
      nip: 'NIP-RAHASIA'
    })
  });
  const doc = (await docRes.json() as { data?: TestDoctor }).data;
  if (docRes.status !== 201 || !doc) throw new Error(`Gagal membuat dokter uji (HTTP ${docRes.status}).`);
  return { ...doc, poli: poli.nama };
}
