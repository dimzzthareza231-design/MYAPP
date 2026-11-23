// Rute klinis inti yang persisten: catatan SOAP (RME), e-resep, dan tagihan kasir.
// Data disimpan di array store milik server.ts yang terikat ke persistentBindings
// (entitas emr_soap, prescriptions, billings) sehingga setiap mutasi yang sukses
// ditulis ke MySQL/D1/Firebase oleh installPersistenceMiddleware sebelum respons dikirim.
import type express from 'express';
import { randomUUID } from 'node:crypto';

type JsonObject = Record<string, unknown>;

export interface ClinicalStoredRecord extends JsonObject {
  id: string;
  version: number;
  created_at: string;
  created_by: string;
  updated_at: string;
  updated_by: string;
}

export interface ClinicalAuditEntry {
  action: string;
  module: string;
  details: string;
  status?: 'SUCCESS' | 'FAILED' | 'WARNING';
}

export interface ClinicalRoutesContext {
  soapNotes: ClinicalStoredRecord[];
  prescriptions: ClinicalStoredRecord[];
  billings: ClinicalStoredRecord[];
  storageMode: string;
  /** false saat penyimpanan persisten tidak siap di startup: semua rute klinis menolak (fail-closed). */
  ready: boolean;
  audit(req: express.Request, entry: ClinicalAuditEntry): void;
}

export const SOAP_GOVERNANCE_STATUSES = ['AI_GENERATED', 'PENDING_REVIEW', 'HUMAN_VERIFIED', 'FINAL'] as const;
export const SOAP_STATUSES = ['Draft', 'Final'] as const;
export const PRESCRIPTION_STATUSES = [
  'Menunggu Telaah',
  'Dalam Penyiapan',
  'Menunggu Penyerahan',
  'Selesai Terlayani',
  'Ditolak / Klarifikasi DPJP'
] as const;
export const BILLING_STATUSES = ['Belum Lunas', 'Lunas', 'Sebagian', 'Dibatalkan', 'Menunggu Verifikasi BPJS'] as const;
export const BILLING_SERVICE_TYPES = ['Rawat Jalan', 'Rawat Inap', 'IGD'] as const;

const CLINICAL_WRITER_ROLES = ['super_admin', 'dokter', 'perawat', 'bidan'];
const SOAP_FINALIZER_ROLES = ['super_admin', 'dokter', 'bidan'];
const PRESCRIBER_ROLES = ['super_admin', 'dokter', 'bidan'];
const PHARMACIST_ROLES = ['super_admin', 'apoteker'];

const RECORD_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;
const SERVER_FIELDS = new Set(['id', 'version', 'created_at', 'created_by', 'updated_at', 'updated_by']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_RECORD_BYTES = 256 * 1024;

class ValidationError extends Error {
  constructor(readonly status: number, readonly code: string, readonly field?: string) {
    super(code);
  }
}

function isPlainObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertSafeJson(value: unknown, depth = 0): void {
  if (depth > 12) throw new ValidationError(422, 'PAYLOAD_TOO_DEEP');
  if (Array.isArray(value)) {
    for (const item of value) assertSafeJson(item, depth + 1);
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) throw new ValidationError(400, 'INVALID_FIELD_NAME', key);
      assertSafeJson(item, depth + 1);
    }
    return;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new ValidationError(422, 'INVALID_NUMBER');
}

function sanitizeBody(body: unknown): JsonObject {
  if (!isPlainObject(body)) throw new ValidationError(400, 'INVALID_PAYLOAD');
  assertSafeJson(body);
  const serialized = JSON.stringify(body);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RECORD_BYTES) throw new ValidationError(413, 'PAYLOAD_TOO_LARGE');
  const clean = JSON.parse(serialized) as JsonObject;
  for (const key of SERVER_FIELDS) delete clean[key];
  return clean;
}

function requireString(record: JsonObject, field: string, max: number, optional = false): string | undefined {
  let value = record[field];
  if (typeof value === 'number' && Number.isFinite(value)) value = String(value);
  if (value === undefined || value === null || value === '') {
    if (optional) {
      delete record[field];
      return undefined;
    }
    throw new ValidationError(400, 'MISSING_FIELD', field);
  }
  if (typeof value !== 'string' || value.length > max || !value.trim()) {
    throw new ValidationError(422, 'INVALID_FIELD', field);
  }
  record[field] = value.trim();
  return record[field] as string;
}

function requireEnum<T extends string>(record: JsonObject, field: string, allowed: readonly T[], fallback?: T): T {
  const value = record[field] ?? fallback;
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    throw new ValidationError(422, 'INVALID_FIELD', field);
  }
  record[field] = value;
  return value as T;
}

function requireAmount(record: JsonObject, field: string, optional = false): number {
  const value = record[field];
  if (value === undefined && optional) return 0;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12) {
    throw new ValidationError(422, 'INVALID_FIELD', field);
  }
  return value;
}

function clinicalSection(record: JsonObject, field: string): void {
  const value = record[field];
  if (value === undefined || value === null) {
    record[field] = '';
    return;
  }
  if (typeof value === 'string') {
    if (value.length > 20_000) throw new ValidationError(422, 'INVALID_FIELD', field);
    return;
  }
  if (!isPlainObject(value)) throw new ValidationError(422, 'INVALID_FIELD', field);
}

function rejectUnknownFields(record: JsonObject, allowed: Set<string>): void {
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new ValidationError(400, 'UNKNOWN_FIELD', unknown);
}

function principalOf(req: express.Request): { email: string; roleId: string } {
  const principal = (req as express.Request & { corePrincipal?: { email?: string; roleId?: string } }).corePrincipal;
  return { email: principal?.email || 'unknown', roleId: principal?.roleId || 'unknown' };
}

function hasRole(req: express.Request, roles: string[]): boolean {
  return roles.includes(principalOf(req).roleId);
}

function expectedVersion(body: unknown): number | undefined {
  if (!isPlainObject(body) || body.version === undefined) return undefined;
  if (!Number.isInteger(body.version)) throw new ValidationError(422, 'INVALID_FIELD', 'version');
  return body.version as number;
}

function stamp(req: express.Request, data: JsonObject, existing?: ClinicalStoredRecord, id?: string): ClinicalStoredRecord {
  const now = new Date().toISOString();
  const actor = principalOf(req).email;
  return {
    ...data,
    id: existing?.id || id || randomUUID(),
    version: (existing?.version || 0) + 1,
    created_at: existing?.created_at || now,
    created_by: existing?.created_by || actor,
    updated_at: now,
    updated_by: actor
  };
}

function replaceRecord(store: ClinicalStoredRecord[], next: ClinicalStoredRecord): void {
  const index = store.findIndex((item) => item.id === next.id);
  if (index >= 0) store.splice(index, 1);
  store.unshift(next);
}

function sendError(res: express.Response, error: unknown): express.Response {
  if (error instanceof ValidationError) {
    return res.status(error.status).json({ success: false, code: error.code, ...(error.field ? { field: error.field } : {}) });
  }
  throw error;
}

function queryString(value: unknown, max = 128): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : undefined;
}

function listResponse(records: ClinicalStoredRecord[], limitValue: unknown, storageMode: string) {
  const parsed = Number.parseInt(typeof limitValue === 'string' ? limitValue : '200', 10);
  const limit = Number.isFinite(parsed) ? Math.min(500, Math.max(1, parsed)) : 200;
  const sorted = [...records].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return { success: true, storageMode, total: sorted.length, data: sorted.slice(0, limit) };
}

function assertVersion(existing: ClinicalStoredRecord, body: unknown): void {
  const version = expectedVersion(body);
  if (version !== undefined && version !== existing.version) {
    throw new ValidationError(409, 'VERSION_CONFLICT');
  }
}

// ---------------------------------------------------------------------------
// Validasi payload per entitas
// ---------------------------------------------------------------------------

const SOAP_FIELDS = new Set([
  'kunjungan_id', 'no_rm', 'pasien_id', 'pasien_nama', 'dokter', 'unit', 'source',
  'subjective', 'objective', 'assessment', 'plan', 'icd10', 'tindakan_icd9',
  'vital_signs', 'alergi', 'kontrol', 'ai_governance_status', 'status', 'version'
]);

export function validateSoapNote(body: unknown): JsonObject {
  const record = sanitizeBody(body);
  rejectUnknownFields(record, SOAP_FIELDS);
  delete record.version;
  requireString(record, 'kunjungan_id', 128);
  requireString(record, 'no_rm', 64);
  for (const field of ['pasien_id', 'pasien_nama', 'dokter', 'unit', 'source', 'alergi', 'kontrol', 'tindakan_icd9']) {
    requireString(record, field, field === 'kontrol' || field === 'alergi' ? 2000 : 200, true);
  }
  requireString(record, 'icd10', 20, true);
  for (const section of ['subjective', 'objective', 'assessment', 'plan']) clinicalSection(record, section);
  if (record.vital_signs !== undefined && !isPlainObject(record.vital_signs)) {
    throw new ValidationError(422, 'INVALID_FIELD', 'vital_signs');
  }
  requireEnum(record, 'ai_governance_status', SOAP_GOVERNANCE_STATUSES, 'PENDING_REVIEW');
  requireEnum(record, 'status', SOAP_STATUSES, 'Draft');
  if (record.ai_governance_status === 'FINAL') record.status = 'Final';
  if (record.status === 'Final') record.ai_governance_status = 'FINAL';
  return record;
}

const PRESCRIPTION_IDENTITY_FIELDS = ['no_rm', 'kunjungan_id', 'dokter_penulis'] as const;

export function validatePrescription(body: unknown): JsonObject {
  const record = sanitizeBody(body);
  delete record.version;
  requireString(record, 'no_rm', 64);
  requireString(record, 'kunjungan_id', 128);
  requireString(record, 'nama_pasien', 200);
  requireString(record, 'dokter_penulis', 200);
  requireString(record, 'no_resep', 64, true);
  requireString(record, 'kode_icd10', 20, true);
  requireEnum(record, 'status', PRESCRIPTION_STATUSES, 'Menunggu Telaah');
  const items = record.items;
  if (!Array.isArray(items) || items.length === 0 || items.length > 100) {
    throw new ValidationError(422, 'INVALID_FIELD', 'items');
  }
  items.forEach((item, index) => {
    if (!isPlainObject(item)) throw new ValidationError(422, 'INVALID_FIELD', `items.${index}`);
    if (typeof item.nama_obat !== 'string' || !item.nama_obat.trim() || item.nama_obat.length > 200) {
      throw new ValidationError(422, 'INVALID_FIELD', `items.${index}.nama_obat`);
    }
    if (typeof item.jumlah !== 'number' || !Number.isFinite(item.jumlah) || item.jumlah <= 0 || item.jumlah > 10_000) {
      throw new ValidationError(422, 'INVALID_FIELD', `items.${index}.jumlah`);
    }
  });
  for (const field of ['total_biaya_obat', 'jasa_embalase', 'total_tagihan']) {
    if (record[field] !== undefined) requireAmount(record, field);
  }
  return record;
}

export function validateBilling(body: unknown): JsonObject {
  const record = sanitizeBody(body);
  delete record.version;
  requireString(record, 'noRm', 64);
  requireString(record, 'namaPasien', 200);
  requireString(record, 'noBilling', 64, true);
  requireString(record, 'kunjunganId', 128, true);
  requireEnum(record, 'tipeLayanan', BILLING_SERVICE_TYPES);
  requireEnum(record, 'status', BILLING_STATUSES, 'Belum Lunas');
  const items = record.items;
  if (!Array.isArray(items) || items.length > 500) throw new ValidationError(422, 'INVALID_FIELD', 'items');
  let itemsTotal = 0;
  items.forEach((item, index) => {
    if (!isPlainObject(item)) throw new ValidationError(422, 'INVALID_FIELD', `items.${index}`);
    if (typeof item.deskripsi !== 'string' || !item.deskripsi.trim() || item.deskripsi.length > 300) {
      throw new ValidationError(422, 'INVALID_FIELD', `items.${index}.deskripsi`);
    }
    for (const field of ['jumlah', 'hargaSatuan', 'total']) {
      const value = item[field];
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12) {
        throw new ValidationError(422, 'INVALID_FIELD', `items.${index}.${field}`);
      }
    }
    itemsTotal += item.total as number;
  });
  const subtotal = requireAmount(record, 'subtotal');
  if (Math.abs(subtotal - itemsTotal) > 1) throw new ValidationError(422, 'BILLING_SUBTOTAL_MISMATCH', 'subtotal');
  for (const field of ['totalTagihan', 'sisaTagihan']) requireAmount(record, field);
  for (const field of ['diskonTotal', 'pajak', 'biayaAdministrasi', 'uangMukaDeposit', 'jumlahDibayar', 'kembalian']) {
    if (record[field] !== undefined) requireAmount(record, field);
  }
  if (record.status === 'Lunas' && (record.sisaTagihan as number) > 1) {
    throw new ValidationError(422, 'BILLING_NOT_SETTLED', 'sisaTagihan');
  }
  return record;
}

// ---------------------------------------------------------------------------
// Registrasi rute
// ---------------------------------------------------------------------------

export const CLINICAL_ROUTE_PREFIXES = [
  '/api/v1/dossier/soap',
  '/api/v1/dossier/prescriptions',
  '/api/v1/inventory/prescriptions',
  '/api/v1/billing/invoices'
];

export function registerClinicalRoutes(app: express.Express, ctx: ClinicalRoutesContext): void {
  const { soapNotes, prescriptions, billings, storageMode } = ctx;

  // Penjaga bersama: mode penyimpanan klien harus cocok, dan penyimpanan persisten wajib siap (fail-closed).
  app.use(CLINICAL_ROUTE_PREFIXES, (req, res, next) => {
    const requestedMode = req.get('x-storage-mode');
    if (requestedMode && requestedMode !== storageMode) {
      return res.status(503).json({ success: false, code: 'STORAGE_MODE_MISMATCH' });
    }
    if (!ctx.ready) {
      return res.status(503).json({
        success: false,
        code: 'PERSISTENCE_UNAVAILABLE',
        message: 'Penyimpanan rekam medis belum siap. Data klinis tidak ditampilkan maupun disimpan.'
      });
    }
    return next();
  });

  // ---------------- SOAP / Catatan Klinis RME ----------------
  app.get('/api/v1/dossier/soap', (req, res) => {
    const noRm = queryString(req.query.no_rm);
    const kunjunganId = queryString(req.query.kunjungan_id);
    const filtered = soapNotes.filter((note) =>
      (!noRm || note.no_rm === noRm) && (!kunjunganId || String(note.kunjungan_id) === kunjunganId)
    );
    res.json(listResponse(filtered, req.query.limit, storageMode));
  });

  app.get('/api/v1/dossier/soap/:id', (req, res) => {
    const note = soapNotes.find((item) => item.id === req.params.id);
    if (!note) return res.status(404).json({ success: false, code: 'SOAP_NOT_FOUND' });
    return res.json({ success: true, storageMode, data: note });
  });

  const writeSoap = (req: express.Request, res: express.Response, existing?: ClinicalStoredRecord) => {
    try {
      if (!hasRole(req, CLINICAL_WRITER_ROLES)) {
        return res.status(403).json({ success: false, code: 'CLINICAL_ROLE_REQUIRED' });
      }
      if (existing) {
        if (existing.status === 'Final') return res.status(409).json({ success: false, code: 'SOAP_FINALIZED' });
        assertVersion(existing, req.body);
      }
      const data = validateSoapNote(req.body);
      if (data.status === 'Final') {
        if (!hasRole(req, SOAP_FINALIZER_ROLES)) {
          return res.status(403).json({ success: false, code: 'DPJP_SIGNATURE_REQUIRED' });
        }
        data.finalized_at = new Date().toISOString();
        data.finalized_by = principalOf(req).email;
      }
      const record = stamp(req, data, existing, existing ? undefined : `soap-${randomUUID()}`);
      replaceRecord(soapNotes, record);
      ctx.audit(req, {
        action: data.status === 'Final' ? 'FINALIZE_SOAP' : existing ? 'UPDATE_SOAP' : 'CREATE_SOAP',
        module: 'Rekam Medis (RME)',
        details: `Catatan SOAP ${record.id} (No. RM ${record.no_rm}, kunjungan ${record.kunjungan_id}) versi ${record.version}.`
      });
      return res.status(existing ? 200 : 201).json({ success: true, storageMode, data: record });
    } catch (error) {
      return sendError(res, error);
    }
  };

  app.post('/api/v1/dossier/soap', (req, res) => writeSoap(req, res));

  app.put('/api/v1/dossier/soap/:id', (req, res) => {
    const existing = soapNotes.find((item) => item.id === req.params.id);
    if (!existing) return res.status(404).json({ success: false, code: 'SOAP_NOT_FOUND' });
    return writeSoap(req, res, existing);
  });

  // ---------------- E-Resep ----------------
  const listPrescriptions = (req: express.Request, res: express.Response) => {
    const noRm = queryString(req.query.no_rm);
    const kunjunganId = queryString(req.query.kunjungan_id);
    const status = queryString(req.query.status);
    const filtered = prescriptions.filter((rx) =>
      (!noRm || rx.no_rm === noRm) &&
      (!kunjunganId || String(rx.kunjungan_id) === kunjunganId) &&
      (!status || rx.status === status)
    );
    res.json(listResponse(filtered, req.query.limit, storageMode));
  };
  const getPrescription = (req: express.Request, res: express.Response) => {
    const rx = prescriptions.find((item) => item.id === req.params.id);
    if (!rx) return res.status(404).json({ success: false, code: 'PRESCRIPTION_NOT_FOUND' });
    return res.json({ success: true, storageMode, data: rx });
  };

  // Sisi DPJP (scope rekam-medis): menulis dan mengoreksi resep sebelum ditelaah farmasi.
  app.get('/api/v1/dossier/prescriptions', listPrescriptions);
  app.get('/api/v1/dossier/prescriptions/:id', getPrescription);

  app.post('/api/v1/dossier/prescriptions', (req, res) => {
    try {
      if (!hasRole(req, PRESCRIBER_ROLES)) return res.status(403).json({ success: false, code: 'PRESCRIBER_ROLE_REQUIRED' });
      const requestedId = isPlainObject(req.body) && typeof req.body.id === 'string' ? req.body.id : undefined;
      if (requestedId !== undefined && !RECORD_ID_PATTERN.test(requestedId)) {
        return res.status(422).json({ success: false, code: 'INVALID_FIELD', field: 'id' });
      }
      if (requestedId && prescriptions.some((item) => item.id === requestedId)) {
        return res.status(409).json({ success: false, code: 'PRESCRIPTION_EXISTS' });
      }
      const data = validatePrescription(req.body);
      if (data.status !== 'Menunggu Telaah') {
        return res.status(422).json({ success: false, code: 'INVALID_FIELD', field: 'status' });
      }
      const record = stamp(req, data, undefined, requestedId || `rx-${randomUUID()}`);
      if (!record.no_resep) {
        record.no_resep = `RX-${record.created_at.slice(2, 10).replace(/-/g, '')}-${record.id.slice(-6).toUpperCase()}`;
      }
      replaceRecord(prescriptions, record);
      ctx.audit(req, {
        action: 'CREATE_PRESCRIPTION',
        module: 'E-Resep',
        details: `Resep ${record.no_resep} (No. RM ${record.no_rm}) diterbitkan dengan ${(record.items as unknown[]).length} item.`
      });
      return res.status(201).json({ success: true, storageMode, data: record });
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.put('/api/v1/dossier/prescriptions/:id', (req, res) => {
    try {
      if (!hasRole(req, PRESCRIBER_ROLES)) return res.status(403).json({ success: false, code: 'PRESCRIBER_ROLE_REQUIRED' });
      const existing = prescriptions.find((item) => item.id === req.params.id);
      if (!existing) return res.status(404).json({ success: false, code: 'PRESCRIPTION_NOT_FOUND' });
      if (existing.status !== 'Menunggu Telaah' && existing.status !== 'Ditolak / Klarifikasi DPJP') {
        return res.status(409).json({ success: false, code: 'PRESCRIPTION_IN_PHARMACY' });
      }
      assertVersion(existing, req.body);
      const data = validatePrescription(req.body);
      if (data.status !== 'Menunggu Telaah') {
        return res.status(422).json({ success: false, code: 'INVALID_FIELD', field: 'status' });
      }
      const record = stamp(req, { ...data, no_resep: data.no_resep || existing.no_resep }, existing);
      replaceRecord(prescriptions, record);
      ctx.audit(req, {
        action: 'UPDATE_PRESCRIPTION',
        module: 'E-Resep',
        details: `Resep ${record.no_resep} (No. RM ${record.no_rm}) dikoreksi DPJP, versi ${record.version}.`
      });
      return res.json({ success: true, storageMode, data: record });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // Sisi farmasi (scope inventory): antrean resep, telaah, penyiapan, dan penyerahan.
  app.get('/api/v1/inventory/prescriptions', listPrescriptions);
  app.get('/api/v1/inventory/prescriptions/:id', getPrescription);

  app.put('/api/v1/inventory/prescriptions/:id', (req, res) => {
    try {
      if (!hasRole(req, PHARMACIST_ROLES)) return res.status(403).json({ success: false, code: 'PHARMACIST_ROLE_REQUIRED' });
      const existing = prescriptions.find((item) => item.id === req.params.id);
      if (!existing) return res.status(404).json({ success: false, code: 'PRESCRIPTION_NOT_FOUND' });
      if (existing.status === 'Selesai Terlayani') {
        return res.status(409).json({ success: false, code: 'PRESCRIPTION_COMPLETED' });
      }
      assertVersion(existing, req.body);
      const data = validatePrescription(req.body);
      const changedIdentity = PRESCRIPTION_IDENTITY_FIELDS.find((field) => data[field] !== existing[field]);
      if (changedIdentity) {
        return res.status(422).json({ success: false, code: 'PRESCRIPTION_IDENTITY_IMMUTABLE', field: changedIdentity });
      }
      const record = stamp(req, { ...data, no_resep: data.no_resep || existing.no_resep }, existing);
      replaceRecord(prescriptions, record);
      ctx.audit(req, {
        action: record.status === 'Selesai Terlayani' ? 'DISPENSE_PRESCRIPTION' : 'UPDATE_PRESCRIPTION_STATUS',
        module: 'Farmasi',
        details: `Resep ${record.no_resep} (No. RM ${record.no_rm}) berstatus "${record.status}".`
      });
      return res.json({ success: true, storageMode, data: record });
    } catch (error) {
      return sendError(res, error);
    }
  });

  // ---------------- Tagihan Kasir ----------------
  app.get('/api/v1/billing/invoices', (req, res) => {
    const noRm = queryString(req.query.no_rm);
    const status = queryString(req.query.status);
    const tipeLayanan = queryString(req.query.tipe_layanan);
    const filtered = billings.filter((bill) =>
      (!noRm || bill.noRm === noRm) && (!status || bill.status === status) && (!tipeLayanan || bill.tipeLayanan === tipeLayanan)
    );
    res.json(listResponse(filtered, req.query.limit, storageMode));
  });

  app.get('/api/v1/billing/invoices/:id', (req, res) => {
    const bill = billings.find((item) => item.id === req.params.id);
    if (!bill) return res.status(404).json({ success: false, code: 'BILLING_NOT_FOUND' });
    return res.json({ success: true, storageMode, data: bill });
  });

  const settleMetadata = (req: express.Request, data: JsonObject, existing?: ClinicalStoredRecord) => {
    if (data.status === 'Lunas' && existing?.status !== 'Lunas') {
      data.paid_at = new Date().toISOString();
      data.paid_by = principalOf(req).email;
    }
  };

  app.post('/api/v1/billing/invoices', (req, res) => {
    try {
      const requestedId = isPlainObject(req.body) && typeof req.body.id === 'string' ? req.body.id : undefined;
      if (requestedId !== undefined && !RECORD_ID_PATTERN.test(requestedId)) {
        return res.status(422).json({ success: false, code: 'INVALID_FIELD', field: 'id' });
      }
      if (requestedId && billings.some((item) => item.id === requestedId)) {
        return res.status(409).json({ success: false, code: 'BILLING_EXISTS' });
      }
      const data = validateBilling(req.body);
      settleMetadata(req, data);
      const record = stamp(req, data, undefined, requestedId || `bil-${randomUUID()}`);
      if (!record.noBilling) {
        record.noBilling = `BIL-${record.created_at.slice(2, 10).replace(/-/g, '')}-${record.id.slice(-6).toUpperCase()}`;
      }
      replaceRecord(billings, record);
      ctx.audit(req, {
        action: 'CREATE_BILLING',
        module: 'Kasir',
        details: `Tagihan ${record.noBilling} (No. RM ${record.noRm}) dibuat, total Rp ${record.totalTagihan}.`
      });
      return res.status(201).json({ success: true, storageMode, data: record });
    } catch (error) {
      return sendError(res, error);
    }
  });

  app.put('/api/v1/billing/invoices/:id', (req, res) => {
    try {
      const existing = billings.find((item) => item.id === req.params.id);
      if (!existing) return res.status(404).json({ success: false, code: 'BILLING_NOT_FOUND' });
      if (existing.status === 'Lunas' || existing.status === 'Dibatalkan') {
        return res.status(409).json({ success: false, code: 'BILLING_LOCKED' });
      }
      assertVersion(existing, req.body);
      const data = validateBilling(req.body);
      if (data.noRm !== existing.noRm) {
        return res.status(422).json({ success: false, code: 'BILLING_PATIENT_IMMUTABLE', field: 'noRm' });
      }
      settleMetadata(req, data, existing);
      const record = stamp(req, { ...data, noBilling: data.noBilling || existing.noBilling }, existing);
      replaceRecord(billings, record);
      ctx.audit(req, {
        action: record.status === 'Lunas' ? 'SETTLE_BILLING' : 'UPDATE_BILLING',
        module: 'Kasir',
        details: `Tagihan ${record.noBilling} (No. RM ${record.noRm}) berstatus "${record.status}", total Rp ${record.totalTagihan}.`
      });
      return res.json({ success: true, storageMode, data: record });
    } catch (error) {
      return sendError(res, error);
    }
  });
}
