// Master data layanan (poliklinik & dokter) yang dikelola petugas di aplikasi inti.
// Data ini tersimpan lewat adapter persistensi (entitas 'poliklinik' dan 'doctors') dan menjadi
// satu-satunya sumber katalog publik serta validasi booking. Tidak ada data awal/contoh.
import { randomUUID } from 'node:crypto';
import type express from 'express';

export interface ServerPoliklinikRecord {
  id: string;
  kode: string;
  nama: string;
  kategori: string;
  deskripsi: string;
  kapasitas: number;
  aktif: boolean;
  created_at: string;
  updated_at: string;
}

export interface ServerDoctorRecord {
  id: string;
  nama: string;
  spesialis: string;
  subspesialis?: string;
  poli_id: string;
  /** Hari praktik, mis. "Senin - Jumat". */
  hari: string;
  /** Jam praktik, mis. "08:00 - 12:00". */
  jam: string;
  ruangan?: string;
  /** Kuota pasien per tanggal praktik. */
  kuota: number;
  aktif: boolean;
  /** Identitas internal: tidak pernah dikirim ke katalog publik. */
  nip?: string;
  sip?: string;
  str?: string;
  created_at: string;
  updated_at: string;
}

type AuditFn = (entry: {
  user: string;
  role: string;
  action: string;
  module: string;
  ip: string;
  status: 'SUCCESS' | 'FAILED' | 'WARNING';
  details: string;
}) => void;

const DEFAULT_DOCTOR_QUOTA = 30;

function str(value: unknown, max: number): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : undefined;
}

function invalid(res: express.Response, field: string) {
  return res.status(422).json({ success: false, code: 'INVALID_MASTER_FIELD', field });
}

function parsePoli(body: Record<string, unknown>, partial: boolean):
  | { ok: true; value: Partial<ServerPoliklinikRecord> }
  | { ok: false; field: string } {
  const value: Partial<ServerPoliklinikRecord> = {};
  if (!partial || body.kode !== undefined) {
    const kode = str(body.kode, 8)?.toUpperCase();
    if (!kode || !/^[A-Z0-9]{2,8}$/.test(kode)) return { ok: false, field: 'kode' };
    value.kode = kode;
  }
  if (!partial || body.nama !== undefined) {
    const nama = str(body.nama, 120);
    if (!nama || nama.length < 2) return { ok: false, field: 'nama' };
    value.nama = nama;
  }
  for (const [key, max] of [['kategori', 80], ['deskripsi', 500]] as const) {
    if (body[key] !== undefined) {
      const text = str(body[key], max);
      if (text === undefined) return { ok: false, field: key };
      value[key] = text;
    } else if (!partial) value[key] = '';
  }
  if (body.kapasitas !== undefined) {
    if (!Number.isInteger(body.kapasitas) || (body.kapasitas as number) < 0 || (body.kapasitas as number) > 10_000) {
      return { ok: false, field: 'kapasitas' };
    }
    value.kapasitas = body.kapasitas as number;
  } else if (!partial) value.kapasitas = 0;
  if (body.aktif !== undefined) {
    if (typeof body.aktif !== 'boolean') return { ok: false, field: 'aktif' };
    value.aktif = body.aktif;
  } else if (!partial) value.aktif = true;
  return { ok: true, value };
}

function parseDoctor(body: Record<string, unknown>, partial: boolean):
  | { ok: true; value: Partial<ServerDoctorRecord> }
  | { ok: false; field: string } {
  const value: Partial<ServerDoctorRecord> = {};
  const required: Array<[keyof ServerDoctorRecord, number]> = [['nama', 120], ['spesialis', 120], ['poli_id', 128], ['hari', 80], ['jam', 40]];
  for (const [key, max] of required) {
    if (!partial || body[key] !== undefined) {
      const text = str(body[key], max);
      if (!text) return { ok: false, field: key };
      (value as Record<string, unknown>)[key] = text;
    }
  }
  const optional: Array<[keyof ServerDoctorRecord, number]> = [['subspesialis', 120], ['ruangan', 80], ['nip', 40], ['sip', 80], ['str', 80]];
  for (const [key, max] of optional) {
    if (body[key] !== undefined) {
      const text = str(body[key], max);
      if (text === undefined) return { ok: false, field: key };
      (value as Record<string, unknown>)[key] = text || undefined;
    }
  }
  if (body.kuota !== undefined) {
    if (!Number.isInteger(body.kuota) || (body.kuota as number) < 1 || (body.kuota as number) > 1000) {
      return { ok: false, field: 'kuota' };
    }
    value.kuota = body.kuota as number;
  } else if (!partial) value.kuota = DEFAULT_DOCTOR_QUOTA;
  if (body.aktif !== undefined) {
    if (typeof body.aktif !== 'boolean') return { ok: false, field: 'aktif' };
    value.aktif = body.aktif;
  } else if (!partial) value.aktif = true;
  return { ok: true, value };
}

/**
 * Endpoint staf (aplikasi inti, di belakang coreAuth; scope 'pendaftaran', tulis hanya admin):
 *   GET    /api/v1/master/poliklinik          GET    /api/v1/master/doctors
 *   POST   /api/v1/master/poliklinik          POST   /api/v1/master/doctors
 *   PATCH  /api/v1/master/poliklinik/:id      PATCH  /api/v1/master/doctors/:id
 *   DELETE /api/v1/master/poliklinik/:id      DELETE /api/v1/master/doctors/:id
 */
export function registerHospitalMasterRoutes(
  app: express.Express,
  deps: {
    poliklinikStore: ServerPoliklinikRecord[];
    doctorsStore: ServerDoctorRecord[];
    createAuditLog?: AuditFn;
  }
): void {
  const { poliklinikStore, doctorsStore, createAuditLog } = deps;

  const audit = (req: express.Request, action: string, details: string) => {
    createAuditLog?.({
      user: req.corePrincipal?.email || 'unknown',
      role: req.corePrincipal?.roleId || 'unknown',
      action,
      module: 'Master Layanan',
      ip: req.ip || 'unknown',
      status: 'SUCCESS',
      details
    });
  };

  // --- Poliklinik ---------------------------------------------------------
  app.get('/api/v1/master/poliklinik', (_req, res) => {
    res.json({ success: true, total: poliklinikStore.length, data: poliklinikStore });
  });

  app.post('/api/v1/master/poliklinik', (req, res) => {
    const parsed = parsePoli(req.body || {}, false);
    if (!parsed.ok) return invalid(res, parsed.field);
    if (poliklinikStore.some((p) => p.kode === parsed.value.kode)) {
      return res.status(409).json({ success: false, code: 'POLIKLINIK_KODE_EXISTS' });
    }
    const now = new Date().toISOString();
    const record = { ...parsed.value, id: `pol-${randomUUID()}`, created_at: now, updated_at: now } as ServerPoliklinikRecord;
    poliklinikStore.push(record);
    audit(req, 'MASTER_POLIKLINIK_CREATE', `Poliklinik ${record.kode} (${record.nama}) dibuat.`);
    return res.status(201).json({ success: true, data: record });
  });

  app.patch('/api/v1/master/poliklinik/:id', (req, res) => {
    const record = poliklinikStore.find((p) => p.id === req.params.id);
    if (!record) return res.status(404).json({ success: false, code: 'POLIKLINIK_NOT_FOUND' });
    const parsed = parsePoli(req.body || {}, true);
    if (!parsed.ok) return invalid(res, parsed.field);
    if (parsed.value.kode && poliklinikStore.some((p) => p.id !== record.id && p.kode === parsed.value.kode)) {
      return res.status(409).json({ success: false, code: 'POLIKLINIK_KODE_EXISTS' });
    }
    Object.assign(record, parsed.value, { updated_at: new Date().toISOString() });
    audit(req, 'MASTER_POLIKLINIK_UPDATE', `Poliklinik ${record.kode} diperbarui.`);
    return res.json({ success: true, data: record });
  });

  app.delete('/api/v1/master/poliklinik/:id', (req, res) => {
    const index = poliklinikStore.findIndex((p) => p.id === req.params.id);
    if (index < 0) return res.status(404).json({ success: false, code: 'POLIKLINIK_NOT_FOUND' });
    if (doctorsStore.some((d) => d.poli_id === req.params.id)) {
      return res.status(409).json({ success: false, code: 'POLIKLINIK_IN_USE', message: 'Pindahkan atau hapus dokter di poliklinik ini terlebih dahulu.' });
    }
    const [removed] = poliklinikStore.splice(index, 1);
    audit(req, 'MASTER_POLIKLINIK_DELETE', `Poliklinik ${removed.kode} dihapus.`);
    return res.json({ success: true });
  });

  // --- Dokter -------------------------------------------------------------
  app.get('/api/v1/master/doctors', (_req, res) => {
    res.json({ success: true, total: doctorsStore.length, data: doctorsStore });
  });

  app.post('/api/v1/master/doctors', (req, res) => {
    const parsed = parseDoctor(req.body || {}, false);
    if (!parsed.ok) return invalid(res, parsed.field);
    if (!poliklinikStore.some((p) => p.id === parsed.value.poli_id)) return invalid(res, 'poli_id');
    const now = new Date().toISOString();
    const record = { ...parsed.value, id: `doc-${randomUUID()}`, created_at: now, updated_at: now } as ServerDoctorRecord;
    doctorsStore.push(record);
    audit(req, 'MASTER_DOCTOR_CREATE', `Dokter ${record.nama} ditambahkan.`);
    return res.status(201).json({ success: true, data: record });
  });

  app.patch('/api/v1/master/doctors/:id', (req, res) => {
    const record = doctorsStore.find((d) => d.id === req.params.id);
    if (!record) return res.status(404).json({ success: false, code: 'DOCTOR_NOT_FOUND' });
    const parsed = parseDoctor(req.body || {}, true);
    if (!parsed.ok) return invalid(res, parsed.field);
    if (parsed.value.poli_id && !poliklinikStore.some((p) => p.id === parsed.value.poli_id)) return invalid(res, 'poli_id');
    Object.assign(record, parsed.value, { updated_at: new Date().toISOString() });
    audit(req, 'MASTER_DOCTOR_UPDATE', `Dokter ${record.nama} diperbarui.`);
    return res.json({ success: true, data: record });
  });

  app.delete('/api/v1/master/doctors/:id', (req, res) => {
    const index = doctorsStore.findIndex((d) => d.id === req.params.id);
    if (index < 0) return res.status(404).json({ success: false, code: 'DOCTOR_NOT_FOUND' });
    const [removed] = doctorsStore.splice(index, 1);
    audit(req, 'MASTER_DOCTOR_DELETE', `Dokter ${removed.nama} dihapus.`);
    return res.json({ success: true });
  });
}
