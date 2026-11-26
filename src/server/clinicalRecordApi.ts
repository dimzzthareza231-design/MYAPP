import { createHash, randomUUID } from 'node:crypto';
import type express from 'express';
import type { PersistenceEntity, PersistenceRepository } from './databaseAdapter';
import { canonicalJson } from './firestoreRest';
import { safeErrorDetails } from './scrubPhi';

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

function isSoftDeleted(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && typeof value.deletedAt === 'string';
}

function hasText(value: unknown, maxLength = 500): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= maxLength;
}

function validBilling(data: Record<string, unknown>): boolean {
  const statuses = ['Belum Lunas', 'Lunas', 'Sebagian', 'Dibatalkan', 'Menunggu Verifikasi BPJS'];
  return hasText(data.noRm, 64) && hasText(data.namaPasien, 160) &&
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
  return createHash('sha256').update(canonicalJson(data)).digest('hex');
}

function collectionVersionId(entity: PersistenceEntity): string {
  return `clinical_records_${entity}`;
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
      const entity = collections[name].entity;
      const pageVersion = page === 1
        ? await persistence.get<{ version?: string }>('system_data', collectionVersionId(entity))
        : null;
      const collectionVersion = pageVersion?.version || '0';
      if (page === 1 && req.get('if-none-match') === `"${collectionVersion}"`) {
        return res.status(304).set('ETag', `"${collectionVersion}"`).end();
      }
      const result = await persistence.listPage(entity, offset, limit);
      if (page === 1) res.set('ETag', `"${collectionVersion}"`);
      return res.json({
        success: true,
        page,
        limit,
        collectionVersion: page === 1 ? collectionVersion : undefined,
        total: result.total,
        totalPages: result.total === null ? null : Math.ceil(result.total / limit),
        hasMore: result.hasMore,
        deletedIds: result.records.filter(({ data }) => isSoftDeleted(data)).map(({ id }) => id),
        data: result.records.filter(({ data }) => !isSoftDeleted(data)).map(({ id, data }) => ({ id, data, version: versionOf(data) }))
      });
    } catch (error) {
      console.error(`[Persistence] Could not list ${name}.`, safeErrorDetails(error));
      return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
    }
  });

  app.put('/api/v1/clinical-records/:collection/:id', async (req, res) => {
    const name = collectionName(req.params.collection);
    const id = req.params.id;
    if (!name) return res.status(404).json({ success: false, code: 'CLINICAL_COLLECTION_NOT_FOUND' });
    if (!id || id.length > 128 || id.includes('/')) return res.status(400).json({ success: false, code: 'INVALID_RECORD_ID' });
    const data = req.body?.data;
    if (!isRecord(data) || String(data.id) !== id || Buffer.byteLength(JSON.stringify(data), 'utf8') > MAX_RECORD_BYTES) {
      return res.status(422).json({ success: false, code: 'INVALID_CLINICAL_RECORD' });
    }
    try {
      const entity = collections[name].entity;
      const current = await persistence.get(entity, id);
      const ifMatch = parseVersion(req.get('if-match'));
      const ifNoneMatch = req.get('if-none-match');
      if (isSoftDeleted(current)) {
        return res.status(410).json({ success: false, code: 'CLINICAL_RECORD_DELETED' });
      }
      if (current === null) {
        if (ifNoneMatch !== '*') return res.status(428).json({ success: false, code: 'PRECONDITION_REQUIRED' });
      } else {
        if (!ifMatch && !ifNoneMatch) return res.status(428).json({ success: false, code: 'PRECONDITION_REQUIRED' });
        const currentVersion = versionOf(current);
        if (ifMatch !== currentVersion) {
          return res.status(412).json({ success: false, code: 'VERSION_CONFLICT', version: currentVersion });
        }
      }
      const savedData = name === 'billings'
        ? { ...data, noBilling: current
          ? (current as Record<string, unknown>).noBilling
          : `BIL-${randomUUID()}` }
        : data;
      if (!validators[name](savedData)) {
        return res.status(422).json({ success: false, code: 'INVALID_CLINICAL_RECORD' });
      }
      const collectionVersion = randomUUID();
      const updatedAt = new Date().toISOString();
      await persistence.commit([
        { entity, id, data: savedData },
        { entity: 'system_data', id: collectionVersionId(entity), data: { version: collectionVersion, updatedAt } }
      ]);
      return res.json({ success: true, id, data: savedData, version: versionOf(savedData), collectionVersion });
    } catch (error) {
      console.error(`[Persistence] Could not save ${name} record.`, safeErrorDetails(error));
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
      if (isSoftDeleted(current)) return res.status(410).json({ success: false, code: 'CLINICAL_RECORD_DELETED' });
      const ifMatch = parseVersion(req.get('if-match'));
      if (!ifMatch) return res.status(428).json({ success: false, code: 'PRECONDITION_REQUIRED' });
      const currentVersion = versionOf(current);
      if (ifMatch !== currentVersion) {
        return res.status(412).json({ success: false, code: 'VERSION_CONFLICT', version: currentVersion });
      }
      const collectionVersion = randomUUID();
      const deletedAt = new Date().toISOString();
      const principal = req.corePrincipal;
      await persistence.commit([
        {
          entity,
          id,
          data: {
            ...(current as Record<string, unknown>),
            deletedAt,
            deletedBy: principal?.email || 'unknown',
            deletedRole: principal?.roleId || 'unknown'
          }
        },
        { entity: 'system_data', id: collectionVersionId(entity), data: { version: collectionVersion, updatedAt: deletedAt } }
      ]);
      return res.json({ success: true, id, deletedAt });
    } catch (error) {
      console.error(`[Persistence] Could not delete ${name} record.`, safeErrorDetails(error));
      return res.status(503).json({ success: false, code: 'PERSISTENCE_UNAVAILABLE' });
    }
  });
}
