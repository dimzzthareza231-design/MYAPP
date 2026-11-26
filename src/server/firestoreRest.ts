// Firestore lewat REST + service account (WebCrypto), karena firebase-admin tidak jalan di Cloudflare Workers.
import {
  FIRESTORE_COLLECTIONS, assertEntity, assertRecordId,
  type PersistenceChange, type PersistenceEntity, type PersistenceHealth, type PersistenceRepository, type StoredRecord
} from './databaseAdapter';

type FsValue = Record<string, unknown>;

export function toFs(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v as object).filter(([, x]) => x !== undefined).map(([k, x]) => [k, toFs(x)])) } };
}

export function fromFs(v: FsValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return ((v.arrayValue as { values?: FsValue[] }).values ?? []).map(fromFs);
  if ('mapValue' in v) return fromFields((v.mapValue as { fields?: Record<string, FsValue> }).fields);
  return null;
}

const fromFields = (f: Record<string, FsValue> = {}) => Object.fromEntries(Object.entries(f).map(([k, x]) => [k, fromFs(x)]));
const b64url = (b: ArrayBuffer | string) =>
  btoa(typeof b === 'string' ? b : String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

interface ServiceAccount { client_email: string; private_key: string; project_id: string }

export class FirestoreRestAdapter implements PersistenceRepository {
  readonly mode = 'firestore' as const;
  private token?: { value: string; exp: number };
  private readonly sa: ServiceAccount;
  private readonly base: string;

  constructor(serviceAccountJson: string, databaseId = '(default)', private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {
    this.sa = JSON.parse(serviceAccountJson) as ServiceAccount;
    if (!this.sa.client_email || !this.sa.private_key || !this.sa.project_id) throw new Error('Service account Firestore tidak valid.');
    this.base = `projects/${this.sa.project_id}/databases/${databaseId}/documents`;
  }

  private async accessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.exp > now + 60) return this.token.value;
    const head = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const body = b64url(JSON.stringify({
      iss: this.sa.client_email, scope: 'https://www.googleapis.com/auth/datastore',
      aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600
    }));
    const pem = this.sa.private_key.replace(/-----[^-]+-----|\s/g, '');
    const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${head}.${body}`));
    const res = await this.fetcher('https://oauth2.googleapis.com/token', {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${head}.${body}.${b64url(sig)}` })
    });
    const json = await res.json() as { access_token?: string; expires_in?: number };
    if (!json.access_token) throw new Error('Gagal mengambil token Google untuk Firestore.');
    this.token = { value: json.access_token, exp: now + (json.expires_in ?? 3600) };
    return this.token.value;
  }

  private async call(path: string, init: RequestInit = {}): Promise<Response> {
    const res = await this.fetcher(`https://firestore.googleapis.com/v1/${path}`, {
      ...init, headers: { Authorization: `Bearer ${await this.accessToken()}`, 'Content-Type': 'application/json' }
    });
    if (!res.ok && res.status !== 404) throw new Error(`Firestore ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res;
  }

  async health(): Promise<PersistenceHealth> {
    try {
      await this.call(`${this.base}/_health?pageSize=1`);
      return { mode: this.mode, mysqlConnected: false, firebaseConnected: true, persistentReady: true, pendingSync: 0 };
    } catch (error) {
      return { mode: this.mode, mysqlConnected: false, firebaseConnected: false, persistentReady: false, pendingSync: 0,
        lastError: (error instanceof Error ? error.message : String(error)).slice(0, 1000) };
    }
  }

  async get<T>(entity: PersistenceEntity, id: string): Promise<T | null> {
    assertEntity(entity); assertRecordId(id);
    const res = await this.call(`${this.base}/${FIRESTORE_COLLECTIONS[entity]}/${encodeURIComponent(id)}`);
    if (res.status === 404) return null;
    return fromFields(((await res.json()) as { fields?: Record<string, FsValue> }).fields) as T;
  }

  async list<T>(entity: PersistenceEntity): Promise<Array<StoredRecord<T>>> {
    assertEntity(entity);
    const out: Array<StoredRecord<T>> = [];
    let pageToken = '';
    do {
      const res = await this.call(`${this.base}/${FIRESTORE_COLLECTIONS[entity]}?pageSize=300${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`);
      const json = await res.json() as { documents?: Array<{ name: string; fields?: Record<string, FsValue> }>; nextPageToken?: string };
      for (const d of json.documents ?? []) out.push({ id: decodeURIComponent(d.name.split('/').pop()!), data: fromFields(d.fields) as T });
      pageToken = json.nextPageToken ?? '';
    } while (pageToken);
    return out;
  }

  async listPage<T>(entity: PersistenceEntity, offset: number, limit: number) {
    assertEntity(entity);
    const records: Array<StoredRecord<T>> = [];
    let remainingOffset = offset;
    let pageToken = '';
    let hasMore = false;
    do {
      const pageSize = Math.min(300, Math.max(1, remainingOffset + limit + 1));
      const res = await this.call(
        `${this.base}/${FIRESTORE_COLLECTIONS[entity]}?pageSize=${pageSize}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`
      );
      const json = await res.json() as {
        documents?: Array<{ name: string; fields?: Record<string, FsValue> }>;
        nextPageToken?: string;
      };
      const documents = json.documents ?? [];
      if (remainingOffset >= documents.length) {
        remainingOffset -= documents.length;
      } else {
        const pageRecords = documents.slice(remainingOffset);
        remainingOffset = 0;
        for (const document of pageRecords) {
          records.push({
            id: decodeURIComponent(document.name.split('/').pop()!),
            data: fromFields(document.fields) as T
          });
          if (records.length > limit) break;
        }
      }
      pageToken = json.nextPageToken ?? '';
      hasMore = records.length > limit || Boolean(pageToken);
    } while (pageToken && records.length <= limit);
    return { records: records.slice(0, limit), total: null, hasMore };
  }

  async commit(changes: PersistenceChange[]): Promise<void> {
    if (!changes.length) return;
    const writes = changes.map((c) => {
      assertEntity(c.entity); assertRecordId(c.id);
      const name = `${this.base}/${FIRESTORE_COLLECTIONS[c.entity]}/${encodeURIComponent(c.id)}`;
      return c.data === null ? { delete: name } : { update: { name, fields: toFs(c.data).mapValue ? (toFs(c.data).mapValue as { fields: unknown }).fields : { value: toFs(c.data) } } };
    });
    // Firestore menolak >500 tulis per commit. shortcut: batch besar (pembersihan sesi/QR) tidak atomik antar potongan.
    for (let i = 0; i < writes.length; i += 400) {
      await this.call(`${this.base}:commit`, { method: 'POST', body: JSON.stringify({ writes: writes.slice(i, i + 400) }) });
    }
  }

  async close(): Promise<void> {}
}
