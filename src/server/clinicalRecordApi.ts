import { createHash } from 'node:crypto';
import type express from 'express';
import type { PersistenceEntity, PersistenceRepository } from './databaseAdapter';

const MAX_RECORD_BYTES = 900_000;
const MAX_PAGE_SIZE = 100;

const collections = {
  billings: { entity: 'billings', scope: 'kasir' },
  prescriptions: { entity: 'prescriptions', scope: 'inventory' },
  'lab-orders': { entity: 'lab_orders', scope: 'laboratorium' },
  'radiology-orders': { entity: 'radiology_orders', scope: 'radiologi' },
  'emergency-visits': { entity: 'emergency_visits', scope: 'igd' }
} as const satisfies Record<string, { entity: PersistenceEntity; scope: string }>;

type CollectionName = keyof typeof collections;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasText(value: unknown, maxLength = 500): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function validBilling(data: Record<string, unknown>): boolean {
  const statuses = ['Belum Lunas', 'Lunas', 'Sebagian', 'Dibatalkan', 'Menunggu Verifikasi BPJS'];
  return hasText(data.noBilling, 128) && hasText(data.noRm, 64) && hasText(data.namaPasien, 160) &&
    ['Rawat Jalan', 'Rawat Inap', 'IGD'].includes(String(data.tipeLayanan)) &&
    statuses.includes(String(data.status)) && Array.isArray(data.items) && data.items.length <= 500 &&
    ['subtotal', 'diskonTotal', 'pajak', 'biayaAdministrasi', 'totalTagihan', 'uangMukaDeposit', 'sisaTagihan', 'jumlahDibayar', 'kembalian']
      .every((field) => Number.isFinite(data[field]) && Number(data[field]) >= 0);
}

function validPrescription(data: Record<string, unknown>): boolean {
  return hasText(data.no_rm, 64) && hasText(data.nama_pasien, 160) &&
    hasText(data.status, 64) && Array.isArray(data.items) && data.items.length <= 200 &&
    Number.isFinite(data.total_tagihan) && Number(data.total_tagihan) >= 0;
}

function validLabOrder(data: Record<string, unknown>): boolean {
  return hasText(data.no_rm, 64) && hasText(data.nama_pasien, 160) &&
    hasText(data.status, 64) && Array.isArray(data.tests_ordered) && data.tests_ordered.length <= 500 &&
    Array.isArray(data.parameter_results) && data.parameter_results.length <= 1000 &&
    Number.isFinite(data.total_biaya) && Number(data.total_biaya) >= 0;
}

function validRadiologyOrder(data: Record<string, unknown>): boolean {
  const isWorklistRecord = hasText(data.no_order, 128) && hasText(data.no_rm, 64) &&
    hasText(data.nama_pasien, 160) && hasText(data.modalitas, 32) &&
    hasText(data.nama_pemeriksaan, 200);
  const isInterlineRecord = hasText(data.orderNumber, 128) && hasText(data.patientRm, 64) &&
    hasText(data.patientName, 160) && hasText(data.modality, 32) &&
    hasText(data.examName, 200);
  return hasText(data.status, 64) && (isWorklistRecord || isInterlineRecord);
}

function validEmergencyVisit(data: Record<string, unknown>): boolean {
  return hasText(data.no_rm, 64) && hasText(data.nama_pasien, 160) &&
    hasText(data.status, 64) && hasText(data.triage, 32);
}

const validators: Record<CollectionName, (data: Record<string, unknown>) => boolean> = {
  billings: validBilling,
  prescriptions: validPrescription,
  'lab-orders': validLabOrder,
  'radiology-orders': validRadiologyOrder,
  'emergency-visits': validEmergencyVisit
};

function versionOf(data: unknown): string {
  return createHash('sha256').update(JSON.stringify(data)).digest('hex');
}

function parseVersion(header: string | undefined): string | null {
  if (!header || header === '*' || header.startsWith('W/')) return null;
  return header.startsWith('"') && header.endsWith('"') ? header.slice(1, -1) : null;
}

function collectionName(value: string): CollectionName | null {
  return Object.prototype.hasOwnProperty.call(collections, value) ? value as CollectionName : null;
}

export function registerClinicalRecordApi(app: express.Application, persistence: PersistenceRepository): void {
  app.get('/api/v1/clinical-records/:collection', async (req, res) => {
    const name = collectionName(req.params.collection);
    if (!name) return res.status(404).json({ success: false, code: 'CLINICAL_COLLECTION_NOT_FOUND' });
    const page = Number(req.query.page || 1);
    const limit = Math.min(MAX_PAGE_SIZE, Number(req.query.limit || 50));
    const offset = (page - 1) * limit;
    if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 ||
      !Number.isSafeInteger(offset)) {
      return res.status(400).json({ success: false, code: 'INVALID_PAGINATION' });
    }
    try {
      const result = await persistence.listPage(collections[name].entity, offset, limit);
      return res.json({
        success: true,
        page,
        limit,
        total: result.total,
        totalPages: result.total === null ? null : Math.ceil(result.total / limit),
        hasMore: result.hasMore,
        data: result.records.map(({ id, data }) => ({ id, data, version: versionOf(data) }))
      });
    } catch (error) {
      console.error(`[Persistence] Could not list ${name}.`, error);
      return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
    }
  });

  app.put('/api/v1/clinical-records/:collection/:id', async (req, res) => {
    const name = collectionName(req.params.collection);
    const id = req.params.id;
    if (!name) return res.status(404).json({ success: false, code: 'CLINICAL_COLLECTION_NOT_FOUND' });
    if (!id || id.length > 128 || id.includes('/')) return res.status(400).json({ success: false, code: 'INVALID_RECORD_ID' });
    const data = req.body?.data;
    if (!isRecord(data) || String(data.id) !== id || Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_RECORD_BYTES ||
      !validators[name](data)) {
      return res.status(422).json({ success: false, code: 'INVALID_CLINICAL_RECORD' });
    }
    try {
      const entity = collections[name].entity;
      const current = await persistence.get(entity, id);
      const ifMatch = parseVersion(req.get('if-match'));
      const ifNoneMatch = req.get('if-none-match');
      if (current === null) {
        if (ifNoneMatch !== '*') return res.status(428).json({ success: false, code: 'PRECONDITION_REQUIRED' });
      } else {
        if (!ifMatch && !ifNoneMatch) return res.status(428).json({ success: false, code: 'PRECONDITION_REQUIRED' });
        const currentVersion = versionOf(current);
        if (ifMatch !== currentVersion) {
          return res.status(412).json({ success: false, code: 'VERSION_CONFLICT', version: currentVersion });
        }
      }
      await persistence.commit([{ entity, id, data }]);
      return res.json({ success: true, id, version: versionOf(data) });
    } catch (error) {
      console.error(`[Persistence] Could not save ${name} record ${id}.`, error);
      return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
    }
  });

  app.delete('/api/v1/clinical-records/:collection/:id', async (req, res) => {
    const name = collectionName(req.params.collection);
    const id = req.params.id;
    if (!name) return res.status(404).json({ success: false, code: 'CLINICAL_COLLECTION_NOT_FOUND' });
    if (!id || id.length > 128 || id.includes('/')) return res.status(400).json({ success: false, code: 'INVALID_RECORD_ID' });
    try {
      const entity = collections[name].entity;
      const current = await persistence.get(entity, id);
      if (current === null) return res.status(404).json({ success: false, code: 'CLINICAL_RECORD_NOT_FOUND' });
      const ifMatch = parseVersion(req.get('if-match'));
      if (!ifMatch) return res.status(428).json({ success: false, code: 'PRECONDITION_REQUIRED' });
      const currentVersion = versionOf(current);
      if (ifMatch !== currentVersion) {
        return res.status(412).json({ success: false, code: 'VERSION_CONFLICT', version: currentVersion });
      }
      await persistence.commit([{ entity, id, data: null }]);
      return res.json({ success: true, id });
    } catch (error) {
      console.error(`[Persistence] Could not delete ${name} record ${id}.`, error);
      return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
    }
  });
}
