import { createHash } from 'node:crypto';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import { createPool, type Pool, type PoolConnection } from 'mysql2/promise';

export const STORAGE_MODES = ['mysql', 'firebase', 'hybrid', 'memory', 'd1'] as const;
export type StorageMode = typeof STORAGE_MODES[number];

export const PERSISTENCE_ENTITIES = [
  'patients',
  'registrations',
  'queues',
  'emr_soap',
  'prescriptions',
  'billings',
  'qr_tokens',
  'audit_logs',
  'beds',
  'inventory',
  'documents',
  'bookings',
  'system_data',
  'local_auth_users',
  'local_auth_sessions'
] as const;
export type PersistenceEntity = typeof PERSISTENCE_ENTITIES[number];

const MYSQL_TABLES: Record<PersistenceEntity, string> = {
  patients: 'patients',
  registrations: 'registrations',
  queues: 'queues',
  emr_soap: 'emr_soap',
  prescriptions: 'prescriptions',
  billings: 'billings',
  qr_tokens: 'qr_tokens',
  audit_logs: 'audit_logs',
  beds: 'beds',
  inventory: 'inventory',
  documents: 'documents',
  bookings: 'bookings',
  system_data: 'system_data',
  local_auth_users: 'local_auth_users',
  local_auth_sessions: 'local_auth_sessions'
};

const FIRESTORE_COLLECTIONS: Record<PersistenceEntity, string> = {
  patients: 'pasien',
  registrations: 'kunjungan',
  queues: 'antrean',
  emr_soap: 'emr_soap',
  prescriptions: 'resep',
  billings: 'tagihan',
  qr_tokens: 'qr_tokens',
  audit_logs: 'activity_logs',
  beds: 'bed',
  inventory: 'inventory',
  documents: 'dossier_documents',
  bookings: 'bookings',
  system_data: 'system_data',
  local_auth_users: 'local_auth_users',
  local_auth_sessions: 'local_auth_sessions'
};

export interface StoredRecord<T = unknown> {
  id: string;
  data: T;
}

export interface PersistenceChange {
  entity: PersistenceEntity;
  id: string;
  data: unknown | null;
}

export interface PersistenceHealth {
  mode: StorageMode;
  mysqlConnected: boolean;
  firebaseConnected: boolean;
  persistentReady: boolean;
  pendingSync: number;
  lastError?: string;
}

export interface PersistenceRepository {
  readonly mode: StorageMode;
  health(): Promise<PersistenceHealth>;
  get<T>(entity: PersistenceEntity, id: string): Promise<T | null>;
  list<T>(entity: PersistenceEntity): Promise<Array<StoredRecord<T>>>;
  commit(changes: PersistenceChange[]): Promise<void>;
  close(): Promise<void>;
}

export interface OutboxEntry extends PersistenceChange {
  outboxId: number;
}

export interface PrimaryPersistenceRepository extends PersistenceRepository {
  commitWithOutbox(localChanges: PersistenceChange[], cloudChanges: PersistenceChange[]): Promise<void>;
  getPendingOutbox(limit: number): Promise<OutboxEntry[]>;
  markOutboxSynced(ids: number[]): Promise<void>;
  markOutboxFailed(ids: number[], error: string): Promise<void>;
  commitImportedBookings(changes: PersistenceChange[]): Promise<void>;
  pendingCount(): Promise<number>;
}

export interface CloudPersistenceRepository extends PersistenceRepository {
  listBookings(): Promise<Array<StoredRecord<unknown>>>;
}

export function getStorageMode(value = process.env.STORAGE_MODE): StorageMode {
  if (!value) return 'memory';
  if ((STORAGE_MODES as readonly string[]).includes(value)) return value as StorageMode;
  throw new Error(`STORAGE_MODE must be one of: ${STORAGE_MODES.join(', ')}.`);
}

function assertEntity(entity: string): asserts entity is PersistenceEntity {
  if (!(PERSISTENCE_ENTITIES as readonly string[]).includes(entity)) {
    throw new Error(`Unsupported persistence entity: ${entity}.`);
  }
}

function assertRecordId(id: string): void {
  if (!id.trim() || id.length > 128) {
    throw new Error('Persistence record id must contain 1 to 128 characters.');
  }
}

function serializePayload(data: unknown): string {
  const payload = JSON.stringify(data);
  if (payload === undefined) throw new Error('Persistence payload must be JSON serializable.');
  return payload;
}

function decodePayload(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  return JSON.parse(value) as unknown;
}

function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 1000);
}

function persistentReady(mode: StorageMode, mysqlConnected: boolean, firebaseConnected: boolean): boolean {
  if (mode === 'mysql') return mysqlConnected;
  if (mode === 'firebase') return firebaseConnected;
  if (mode === 'hybrid') return mysqlConnected;
  return false;
}

function projectCloudChange(change: PersistenceChange): PersistenceChange | null {
  if (!['registrations', 'queues', 'bookings'].includes(change.entity)) return null;
  if (change.data === null) return change;
  if (!change.data || typeof change.data !== 'object' || Array.isArray(change.data)) return null;

  const record = change.data as Record<string, unknown>;
  const summary: Record<string, unknown> = {};
  for (const key of [
    'tanggal', 'poli', 'dokter', 'jam_praktek', 'nomor_antrian',
    'status', 'tipe', 'checked_in_at'
  ]) {
    if (typeof record[key] === 'string') summary[key] = record[key];
  }
  return { ...change, data: summary };
}

export class MemoryPersistenceRepository implements PersistenceRepository {
  readonly mode = 'memory' as const;
  private readonly records = new Map<PersistenceEntity, Map<string, unknown>>();

  constructor() {
    for (const entity of PERSISTENCE_ENTITIES) this.records.set(entity, new Map());
  }

  async health(): Promise<PersistenceHealth> {
    return {
      mode: this.mode,
      mysqlConnected: false,
      firebaseConnected: false,
      persistentReady: false,
      pendingSync: 0
    };
  }

  async get<T>(entity: PersistenceEntity, id: string): Promise<T | null> {
    return (this.records.get(entity)?.get(id) as T | undefined) ?? null;
  }

  async list<T>(entity: PersistenceEntity): Promise<Array<StoredRecord<T>>> {
    return [...(this.records.get(entity) || new Map())].map(([id, data]) => ({
      id,
      data: structuredClone(data) as T
    }));
  }

  async commit(changes: PersistenceChange[]): Promise<void> {
    for (const change of changes) {
      assertEntity(change.entity);
      assertRecordId(change.id);
      const records = this.records.get(change.entity)!;
      if (change.data === null) records.delete(change.id);
      else records.set(change.id, structuredClone(JSON.parse(serializePayload(change.data))));
    }
  }

  async close(): Promise<void> {}
}

export interface MySqlAdapterConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function mysqlConfigFromEnv(): MySqlAdapterConfig {
  const port = Number.parseInt(process.env.DB_PORT || '3306', 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('DB_PORT must be an integer between 1 and 65535.');
  }
  return {
    host: process.env.DB_HOST || '127.0.0.1',
    port,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'db_myitaru'
  };
}

export class MySQLAdapter implements PrimaryPersistenceRepository {
  readonly mode = 'mysql' as const;
  private readonly pool: Pool;
  private schemaReady = false;
  private lastError?: string;
  private initialization?: Promise<void>;

  constructor(config = mysqlConfigFromEnv(), pool?: Pool) {
    this.pool = pool || createPool({
      ...config,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      connectTimeout: 5000,
      charset: 'utf8mb4'
    });
  }

  async initialize(): Promise<void> {
    if (this.schemaReady) return;
    if (!this.initialization) {
      this.initialization = this.createRuntimeTables()
        .then(() => {
          this.schemaReady = true;
          this.lastError = undefined;
        })
        .catch((error: unknown) => {
          this.lastError = errorText(error);
          console.error(`[Persistence:mysql] XAMPP/MariaDB is unavailable or not initialized: ${this.lastError}`);
          throw error;
        })
        .finally(() => {
          this.initialization = undefined;
        });
    }
    return this.initialization;
  }

  private async createRuntimeTables(): Promise<void> {
    await this.pool.query(
      `CREATE TABLE IF NOT EXISTS sync_outbox (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        entity VARCHAR(40) NOT NULL,
        record_id VARCHAR(128) NOT NULL,
        operation ENUM('upsert', 'delete') NOT NULL,
        payload JSON NULL,
        status ENUM('pending', 'synced') NOT NULL DEFAULT 'pending',
        attempts INT UNSIGNED NOT NULL DEFAULT 0,
        last_error VARCHAR(1000) NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        synced_at TIMESTAMP NULL,
        KEY idx_sync_outbox_pending (status, id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    for (const table of Object.values(MYSQL_TABLES)) {
      await this.pool.query(
        `CREATE TABLE IF NOT EXISTS \`${table}\` (
          id VARCHAR(128) NOT NULL PRIMARY KEY,
          payload JSON NOT NULL,
          updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
    }
  }

  private async ensureReady(): Promise<void> {
    if (!this.schemaReady) await this.initialize();
  }

  async health(): Promise<PersistenceHealth> {
    try {
      await this.ensureReady();
      await this.pool.query('SELECT 1');
      return {
        mode: this.mode,
        mysqlConnected: true,
        firebaseConnected: false,
        persistentReady: true,
        pendingSync: 0
      };
    } catch (error) {
      this.lastError = errorText(error);
      return {
        mode: this.mode,
        mysqlConnected: false,
        firebaseConnected: false,
        persistentReady: false,
        pendingSync: 0,
        lastError: this.lastError
      };
    }
  }

  async get<T>(entity: PersistenceEntity, id: string): Promise<T | null> {
    await this.ensureReady();
    assertEntity(entity);
    assertRecordId(id);
    const table = MYSQL_TABLES[entity];
    const [rows] = await this.pool.query(`SELECT payload FROM \`${table}\` WHERE id = ? LIMIT 1`, [id]);
    const record = (rows as Array<{ payload: unknown }>)[0];
    return record ? decodePayload(record.payload) as T : null;
  }

  async list<T>(entity: PersistenceEntity): Promise<Array<StoredRecord<T>>> {
    await this.ensureReady();
    assertEntity(entity);
    const table = MYSQL_TABLES[entity];
    const [rows] = await this.pool.query(`SELECT id, payload FROM \`${table}\` ORDER BY updated_at DESC`, []);
    return (rows as Array<{ id: string; payload: unknown }>).map((record) => ({
      id: record.id,
      data: decodePayload(record.payload) as T
    }));
  }

  async commit(changes: PersistenceChange[]): Promise<void> {
    await this.commitTransaction(changes, []);
  }

  async commitWithOutbox(localChanges: PersistenceChange[], cloudChanges: PersistenceChange[]): Promise<void> {
    await this.commitTransaction(localChanges, cloudChanges);
  }

  private async commitTransaction(
    changes: PersistenceChange[],
    cloudChanges: PersistenceChange[] = []
  ): Promise<void> {
    if (!changes.length) return;
    await this.ensureReady();
    const connection: PoolConnection = await this.pool.getConnection();
    let transactionStarted = false;
    try {
      await connection.beginTransaction();
      transactionStarted = true;
      for (const change of changes) {
        assertEntity(change.entity);
        assertRecordId(change.id);
        const table = MYSQL_TABLES[change.entity];
        const operation = change.data === null ? 'delete' : 'upsert';
        const payload = change.data === null ? null : serializePayload(change.data);
        if (operation === 'delete') {
          await connection.query(`DELETE FROM \`${table}\` WHERE id = ?`, [change.id]);
        } else {
          await connection.query(
            `INSERT INTO \`${table}\` (id, payload) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE payload = VALUES(payload)`,
            [change.id, payload]
          );
        }
      }
      for (const change of cloudChanges) {
        assertEntity(change.entity);
        assertRecordId(change.id);
        await connection.query(
          'INSERT INTO sync_outbox (entity, record_id, operation, payload) VALUES (?, ?, ?, ?)',
          [
            change.entity,
            change.id,
            change.data === null ? 'delete' : 'upsert',
            change.data === null ? null : serializePayload(change.data)
          ]
        );
      }
      await connection.commit();
      transactionStarted = false;
    } catch (error) {
      if (transactionStarted) {
        try {
          await connection.rollback();
        } catch (rollbackError) {
          console.error('[Persistence:mysql] Transaction rollback failed.', rollbackError);
        }
      }
      throw error;
    } finally {
      connection.release();
    }
  }

  async getPendingOutbox(limit: number): Promise<OutboxEntry[]> {
    await this.ensureReady();
    const safeLimit = Math.max(1, Math.min(500, Math.floor(limit)));
    const [rows] = await this.pool.query(
      `SELECT id, entity, record_id, operation, payload
       FROM sync_outbox WHERE status = 'pending' AND attempts < 10 ORDER BY id LIMIT ${safeLimit}`,
      []
    );
    return (rows as Array<{
      id: number;
      entity: string;
      record_id: string;
      operation: 'upsert' | 'delete';
      payload: unknown;
    }>).map((row) => {
      assertEntity(row.entity);
      return {
        outboxId: row.id,
        entity: row.entity,
        id: row.record_id,
        data: row.operation === 'delete' ? null : decodePayload(row.payload)
      };
    });
  }

  async markOutboxSynced(ids: number[]): Promise<void> {
    if (!ids.length) return;
    await this.ensureReady();
    const placeholders = ids.map(() => '?').join(',');
    await this.pool.query(
      `UPDATE sync_outbox SET status = 'synced', synced_at = CURRENT_TIMESTAMP, last_error = NULL
       WHERE id IN (${placeholders})`,
      ids
    );
    // Baris yang sudah terkirim tidak dibutuhkan lagi setelah seminggu.
    await this.pool.query("DELETE FROM sync_outbox WHERE status = 'synced' AND synced_at < (NOW() - INTERVAL 7 DAY)");
  }

  async markOutboxFailed(ids: number[], error: string): Promise<void> {
    if (!ids.length) return;
    await this.ensureReady();
    const placeholders = ids.map(() => '?').join(',');
    await this.pool.query(
      `UPDATE sync_outbox SET attempts = attempts + 1, last_error = ?
       WHERE id IN (${placeholders})`,
      [error.slice(0, 1000), ...ids]
    );
  }

  async commitImportedBookings(changes: PersistenceChange[]): Promise<void> {
    await this.commitTransaction(changes, []);
  }

  async pendingCount(): Promise<number> {
    await this.ensureReady();
    const [rows] = await this.pool.query(
      "SELECT COUNT(*) AS count FROM sync_outbox WHERE status = 'pending' AND attempts < 10",
      []
    );
    return Number((rows as Array<{ count: number | string }>)[0]?.count || 0);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  get error(): string | undefined {
    return this.lastError;
  }
}

// Structural subset of Cloudflare's D1Database so this module type-checks without workers-types globals.
export interface D1PreparedStatementLike {
  bind(...values: unknown[]): D1PreparedStatementLike;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatementLike;
  batch(statements: D1PreparedStatementLike[]): Promise<unknown[]>;
}

// Schema lives in migrations/0001_init.sql (applied with `wrangler d1 migrations apply`).
export class D1Adapter implements PersistenceRepository {
  readonly mode = 'd1' as const;
  private lastError?: string;

  constructor(private readonly db: D1DatabaseLike) {}

  async health(): Promise<PersistenceHealth> {
    try {
      // Also proves the migration ran: fails if the tables are missing.
      await this.db.prepare('SELECT 1 FROM system_data LIMIT 1').all();
      this.lastError = undefined;
      return { mode: this.mode, mysqlConnected: false, firebaseConnected: false, persistentReady: true, pendingSync: 0 };
    } catch (error) {
      this.lastError = errorText(error);
      return {
        mode: this.mode,
        mysqlConnected: false,
        firebaseConnected: false,
        persistentReady: false,
        pendingSync: 0,
        lastError: this.lastError
      };
    }
  }

  async get<T>(entity: PersistenceEntity, id: string): Promise<T | null> {
    assertEntity(entity);
    assertRecordId(id);
    const row = await this.db
      .prepare(`SELECT payload FROM "${MYSQL_TABLES[entity]}" WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<{ payload: string }>();
    return row ? decodePayload(row.payload) as T : null;
  }

  async list<T>(entity: PersistenceEntity): Promise<Array<StoredRecord<T>>> {
    assertEntity(entity);
    const { results } = await this.db
      .prepare(`SELECT id, payload FROM "${MYSQL_TABLES[entity]}" ORDER BY updated_at DESC, rowid DESC`)
      .all<{ id: string; payload: string }>();
    return results.map((row) => ({ id: row.id, data: decodePayload(row.payload) as T }));
  }

  async commit(changes: PersistenceChange[]): Promise<void> {
    if (!changes.length) return;
    const statements = changes.map((change) => {
      assertEntity(change.entity);
      assertRecordId(change.id);
      const table = MYSQL_TABLES[change.entity];
      if (change.data === null) {
        return this.db.prepare(`DELETE FROM "${table}" WHERE id = ?`).bind(change.id);
      }
      return this.db
        .prepare(
          `INSERT INTO "${table}" (id, payload, updated_at) VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`
        )
        .bind(change.id, serializePayload(change.data));
    });
    // D1 batch runs as a single transaction: all changes apply or none do.
    await this.db.batch(statements);
  }

  async close(): Promise<void> {}
}

function createAdminFirestore(): Firestore | null {
  const rawServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!rawServiceAccount || !projectId) return null;

  let serviceAccount: Record<string, unknown>;
  try {
    serviceAccount = JSON.parse(rawServiceAccount) as Record<string, unknown>;
  } catch (error) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must be valid JSON.', { cause: error });
  }
  if (serviceAccount.project_id !== projectId ||
      typeof serviceAccount.private_key !== 'string' ||
      typeof serviceAccount.client_email !== 'string') {
    throw new Error('Firebase service account project_id, private_key, or client_email is invalid.');
  }
  const name = 'myitaru-persistence';
  const app = getApps().find((item) => item.name === name) || initializeApp({
    credential: cert(serviceAccount as Parameters<typeof cert>[0]),
    projectId
  }, name);
  return getFirestore(app);
}

function createFirebaseAdapter(): FirebaseServerAdapter {
  try {
    return new FirebaseServerAdapter();
  } catch (error) {
    console.error(`[Persistence:firebase] Firestore configuration is invalid: ${errorText(error)}`);
    return new FirebaseServerAdapter(null);
  }
}

export class FirebaseServerAdapter implements CloudPersistenceRepository {
  readonly mode = 'firebase' as const;
  constructor(private readonly firestore: Firestore | null = createAdminFirestore()) {}

  async health(): Promise<PersistenceHealth> {
    if (!this.firestore) {
      return {
        mode: this.mode,
        mysqlConnected: false,
        firebaseConnected: false,
        persistentReady: false,
        pendingSync: 0,
        lastError: 'Firebase Admin credentials are not configured.'
      };
    }
    try {
      await this.firestore.collection('_health').limit(1).get();
      return {
        mode: this.mode,
        mysqlConnected: false,
        firebaseConnected: true,
        persistentReady: true,
        pendingSync: 0
      };
    } catch (error) {
      return {
        mode: this.mode,
        mysqlConnected: false,
        firebaseConnected: false,
        persistentReady: false,
        pendingSync: 0,
        lastError: errorText(error)
      };
    }
  }

  async get<T>(entity: PersistenceEntity, id: string): Promise<T | null> {
    if (!this.firestore) throw new Error('Firebase persistence is not configured.');
    assertEntity(entity);
    assertRecordId(id);
    const snapshot = await this.firestore.collection(FIRESTORE_COLLECTIONS[entity]).doc(id).get();
    return snapshot.exists ? snapshot.data() as T : null;
  }

  async list<T>(entity: PersistenceEntity): Promise<Array<StoredRecord<T>>> {
    if (!this.firestore) throw new Error('Firebase persistence is not configured.');
    assertEntity(entity);
    const snapshot = await this.firestore.collection(FIRESTORE_COLLECTIONS[entity]).get();
    return snapshot.docs.map((document) => ({ id: document.id, data: document.data() as T }));
  }

  async listBookings(): Promise<Array<StoredRecord<unknown>>> {
    if (!this.firestore) throw new Error('Firebase persistence is not configured.');
    const snapshot = await this.firestore.collection(FIRESTORE_COLLECTIONS.bookings).get();
    return snapshot.docs.map((document) => ({ id: document.id, data: document.data() }));
  }

  async commit(changes: PersistenceChange[]): Promise<void> {
    if (!changes.length) return;
    if (!this.firestore) throw new Error('Firebase persistence is not configured.');
    if (changes.length > 450) throw new Error('Firestore persistence batch exceeds the safe 450-write limit.');
    const batch = this.firestore.batch();
    for (const change of changes) {
      assertEntity(change.entity);
      assertRecordId(change.id);
      const reference = this.firestore.collection(FIRESTORE_COLLECTIONS[change.entity]).doc(change.id);
      if (change.data === null) batch.delete(reference);
      else batch.set(reference, JSON.parse(serializePayload(change.data)) as DocumentData);
    }
    await batch.commit();
  }

  async close(): Promise<void> {}
}

export class HybridAdapter implements PersistenceRepository {
  readonly mode = 'hybrid' as const;
  private syncTimer?: NodeJS.Timeout;
  private bookingTimer?: NodeJS.Timeout;
  private syncing = false;
  private lastSyncError?: string;
  private bookingsImported?: (bookings: Array<StoredRecord<unknown>>) => void;

  constructor(
    private readonly mysql: PrimaryPersistenceRepository,
    private readonly firebase: CloudPersistenceRepository
  ) {}

  async health(): Promise<PersistenceHealth> {
    const [mysql, firebase, pendingSync] = await Promise.all([
      this.mysql.health(),
      this.firebase.health(),
      this.mysql.pendingCount().catch(() => 0)
    ]);
    return {
      mode: this.mode,
      mysqlConnected: mysql.mysqlConnected,
      firebaseConnected: firebase.firebaseConnected,
      persistentReady: mysql.mysqlConnected,
      pendingSync,
      lastError: this.lastSyncError || mysql.lastError || firebase.lastError
    };
  }

  get<T>(entity: PersistenceEntity, id: string): Promise<T | null> {
    return this.mysql.get<T>(entity, id);
  }

  list<T>(entity: PersistenceEntity): Promise<Array<StoredRecord<T>>> {
    return this.mysql.list<T>(entity);
  }

  async commit(changes: PersistenceChange[]): Promise<void> {
    const cloudChanges = changes.flatMap((change) => {
      const projection = projectCloudChange(change);
      return projection ? [projection] : [];
    });
    await this.mysql.commitWithOutbox(changes, cloudChanges);
    void this.syncPending().catch((error: unknown) => {
      this.lastSyncError = errorText(error);
      console.warn(`[Persistence:hybrid] Firestore replication deferred to sync_outbox: ${this.lastSyncError}`);
    });
  }

  async syncPending(): Promise<number> {
    if (this.syncing) return 0;
    this.syncing = true;
    try {
      const pending = await this.mysql.getPendingOutbox(400);
      if (!pending.length) {
        this.lastSyncError = undefined;
        return 0;
      }
      try {
        await this.firebase.commit(pending.map(({ entity, id, data }) => ({ entity, id, data })));
        await this.mysql.markOutboxSynced(pending.map((item) => item.outboxId));
        this.lastSyncError = undefined;
      } catch (error) {
        // Satu baris rusak tidak boleh menahan seluruh batch: coba satu per satu, baris gagal dihitung percobaannya
        // dan berhenti diulang setelah 10 kali (dead-letter).
        const message = errorText(error);
        let failed = 0;
        for (const item of pending) {
          try {
            await this.firebase.commit([{ entity: item.entity, id: item.id, data: item.data }]);
            await this.mysql.markOutboxSynced([item.outboxId]);
          } catch (itemError) {
            failed += 1;
            await this.mysql.markOutboxFailed([item.outboxId], errorText(itemError));
          }
        }
        this.lastSyncError = failed ? message : undefined;
        if (failed) console.warn(`[Persistence:hybrid] Cloud sync failed for ${failed}/${pending.length} change(s); they remain queued.`);
      }
      return pending.length;
    } finally {
      this.syncing = false;
    }
  }

  setBookingsImportedHandler(handler: (bookings: Array<StoredRecord<unknown>>) => void): void {
    this.bookingsImported = handler;
  }

  async syncExternalBookings(): Promise<void> {
    try {
      const bookings = await this.firebase.listBookings();
      const toImport: PersistenceChange[] = [];
      const imported: Array<StoredRecord<unknown>> = [];
      for (const booking of bookings) {
        if (!booking.id.trim() || booking.id.length > 128) continue;
        if (!isServerAppointmentPayload(booking.data)) {
          console.warn(`[Persistence:hybrid] Skipped malformed external booking ${booking.id}.`);
          continue;
        }
        const exists = await this.mysql.get('registrations', booking.id);
        if (!exists) {
          const data = { ...booking.data, id: booking.id };
          toImport.push({
            entity: 'registrations',
            id: booking.id,
            data
          });
          imported.push({ id: booking.id, data });
        }
      }
      if (toImport.length) {
        await this.mysql.commitImportedBookings(toImport);
        this.bookingsImported?.(imported);
      }
    } catch (error) {
      this.lastSyncError = errorText(error);
      console.warn(`[Persistence:hybrid] Could not import Firestore bookings: ${this.lastSyncError}`);
    }
  }

  startSyncWorker(intervalMs = 15_000): void {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(() => {
      void this.syncPending().catch((error: unknown) => {
        this.lastSyncError = errorText(error);
        console.warn(`[Persistence:hybrid] Sync worker failed: ${this.lastSyncError}`);
      });
    }, intervalMs);
    this.syncTimer.unref();
    this.bookingTimer = setInterval(() => {
      void this.syncExternalBookings();
    }, Math.max(intervalMs, 60_000));
    this.bookingTimer.unref();
    void this.syncPending().catch((error: unknown) => {
      this.lastSyncError = errorText(error);
      console.warn(`[Persistence:hybrid] Initial sync deferred: ${this.lastSyncError}`);
    });
    void this.syncExternalBookings();
  }

  async close(): Promise<void> {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.bookingTimer) clearInterval(this.bookingTimer);
    await Promise.all([this.mysql.close(), this.firebase.close()]);
  }
}

function isServerAppointmentPayload(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  const requiredStrings = [
    'pasien_id', 'pasien_nama', 'no_rm', 'poli', 'dokter', 'tanggal',
    'jam_praktek', 'nomor_antrian', 'status', 'tipe', 'created_at'
  ];
  return requiredStrings.every((key) => typeof record[key] === 'string' && record[key].length > 0) &&
    ['Menunggu', 'Diperiksa', 'Selesai', 'Dibatalkan'].includes(record.status as string);
}

export interface PersistenceFactoryOptions {
  mode?: StorageMode;
  mysql?: PrimaryPersistenceRepository;
  firebase?: CloudPersistenceRepository;
  d1?: D1DatabaseLike;
}

export async function createPersistenceRepository(
  options: PersistenceFactoryOptions = {}
): Promise<PersistenceRepository> {
  const mode = options.mode || getStorageMode();
  if (mode === 'memory') {
    console.info('[Persistence] STORAGE_MODE=memory; changes are process-local and are not production-ready.');
    return new MemoryPersistenceRepository();
  }

  if (mode === 'd1') {
    if (!options.d1) throw new Error('STORAGE_MODE=d1 requires a D1 binding (runs only on Cloudflare Workers).');
    return new D1Adapter(options.d1);
  }

  if (mode === 'mysql') {
    const mysql = options.mysql || new MySQLAdapter();
    if (mysql instanceof MySQLAdapter) {
      try {
        await mysql.initialize();
      } catch {
        // The service stays available for health checks; writes fail until the database is reachable.
      }
    }
    return mysql;
  }

  if (mode === 'firebase') {
    const firebase = options.firebase || createFirebaseAdapter();
    const health = await firebase.health();
    if (!health.firebaseConnected) {
      console.error(`[Persistence:firebase] Firestore is not ready: ${health.lastError || 'connection failed'}`);
    }
    return firebase;
  }

  const mysql = options.mysql || new MySQLAdapter();
  const firebase = options.firebase || createFirebaseAdapter();
  if (mysql instanceof MySQLAdapter) {
    try {
      await mysql.initialize();
    } catch {
      // Keep diagnostics online but never fall back to process-local writes.
    }
  }
  const health = await firebase.health();
  if (!health.firebaseConnected) {
    console.warn(`[Persistence:hybrid] Firestore is offline; MySQL outbox will retain cloud changes: ${health.lastError || 'connection failed'}`);
  }
  const hybrid = new HybridAdapter(mysql, firebase);
  return hybrid;
}

export function hashQrToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
