// Repositori persisten palsu (in-process) untuk pengujian: menyimulasikan MySQL/D1 tanpa server.
// Fixture uji dibuat lewat seed() / commit(), bukan dari data contoh di aplikasi.
import type {
  OutboxEntry,
  PersistenceChange,
  PersistenceEntity,
  PersistenceHealth,
  PrimaryPersistenceRepository,
  StoredRecord
} from '../../src/server/databaseAdapter';

export class FakePrimaryRepository implements PrimaryPersistenceRepository {
  readonly mode = 'mysql' as const;
  private readonly records = new Map<PersistenceEntity, Map<string, unknown>>();
  private readonly outbox: OutboxEntry[] = [];
  private nextOutboxId = 1;

  constructor(private readonly online = true) {
    for (const entity of [
      'patients', 'registrations', 'queues', 'emr_soap', 'prescriptions',
      'billings', 'qr_tokens', 'audit_logs', 'beds', 'inventory',
      'documents', 'bookings', 'system_data', 'doctors', 'poliklinik', 'payments'
    ] as const) {
      this.records.set(entity, new Map());
    }
  }

  async health(): Promise<PersistenceHealth> {
    return {
      mode: this.mode,
      mysqlConnected: this.online,
      firebaseConnected: false,
      persistentReady: this.online,
      pendingSync: this.outbox.length
    };
  }

  async get<T>(entity: PersistenceEntity, id: string): Promise<T | null> {
    if (!this.online) throw new Error('simulated MySQL outage');
    return (this.records.get(entity)?.get(id) as T | undefined) ?? null;
  }

  async list<T>(entity: PersistenceEntity): Promise<Array<StoredRecord<T>>> {
    if (!this.online) throw new Error('simulated MySQL outage');
    return [...(this.records.get(entity) || new Map())].map(([id, data]) => ({
      id,
      data: structuredClone(data) as T
    }));
  }

  async commit(changes: PersistenceChange[]): Promise<void> {
    if (!this.online) throw new Error('simulated MySQL outage');
    for (const change of changes) {
      const entityRecords = this.records.get(change.entity)!;
      if (change.data === null) entityRecords.delete(change.id);
      else entityRecords.set(change.id, structuredClone(change.data));
    }
  }

  async commitWithOutbox(localChanges: PersistenceChange[], cloudChanges: PersistenceChange[]): Promise<void> {
    await this.commit(localChanges);
    for (const change of cloudChanges) {
      this.outbox.push({ ...structuredClone(change), outboxId: this.nextOutboxId++ });
    }
  }

  async getPendingOutbox(limit: number): Promise<OutboxEntry[]> {
    return this.outbox.slice(0, limit).map((entry) => structuredClone(entry));
  }

  async markOutboxSynced(ids: number[]): Promise<void> {
    const synced = new Set(ids);
    for (let index = this.outbox.length - 1; index >= 0; index -= 1) {
      if (synced.has(this.outbox[index].outboxId)) this.outbox.splice(index, 1);
    }
  }

  async markOutboxFailed(): Promise<void> {}

  async commitImportedBookings(changes: PersistenceChange[]): Promise<void> {
    await this.commit(changes);
  }

  async pendingCount(): Promise<number> {
    return this.outbox.length;
  }

  async close(): Promise<void> {}

  /** Mengisi fixture uji langsung ke penyimpanan palsu. */
  seed(entity: PersistenceEntity, records: Array<{ id: string } & Record<string, unknown>>): this {
    const entityRecords = this.records.get(entity)!;
    for (const record of records) entityRecords.set(record.id, structuredClone(record));
    return this;
  }
}
