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
