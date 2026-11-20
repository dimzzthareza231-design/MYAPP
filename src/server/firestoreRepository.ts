import { HttpError } from './security';
export type RecordData = Record<string, any>;
export interface Repository {
  get(collection: string, id: string): Promise<RecordData | null>;
  list(collection: string, pageToken?: string): Promise<{ documents: RecordData[]; nextPageToken?: string }>;
  query(collection: string, field: string, value: string): Promise<RecordData[]>;
  put(collection: string, id: string, data: RecordData): Promise<RecordData>;
}
function segment(value: string): string {
  if (!value || value.length > 128 || value.includes('/') || value === '.' || value === '..') throw new HttpError(400, 'ID tidak valid.');
  return encodeURIComponent(value);
}
function encode(value: any): any {
  if (value === null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isFinite(value)) return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (value && typeof value === 'object') return { mapValue: { fields: Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).map(([k, v]) => [k, encode(v)])) } };
  throw new HttpError(400, 'Tipe data tidak didukung.');
}
function decode(value: any): any {
  if ('stringValue' in value) return value.stringValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([k, v]) => [k, decode(v)]));
  return null;
}
function document(value: any): RecordData {
  return { ...Object.fromEntries(Object.entries(value.fields || {}).map(([k, v]) => [k, decode(v)])), id: decodeURIComponent(value.name.split('/').pop()) };
}

// Use the caller's Firebase ID token: Firestore Security Rules remain enforced.
// There is deliberately no admin credential, in-memory data fallback, or seed.
export class FirestoreRepository implements Repository {
  private base: string;
  constructor(private token: string, env: NodeJS.ProcessEnv = process.env, private fetcher: typeof fetch = fetch) {
    if (!env.FIREBASE_PROJECT_ID) throw new HttpError(503, 'Database belum dikonfigurasi.');
    this.base = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/${encodeURIComponent(env.FIREBASE_DATABASE_ID || '(default)')}/documents`;
  }
  private async request(path: string, method = 'GET', body?: unknown): Promise<any> {
    let response: Response;
    try {
      response = await this.fetcher(this.base + path, { method, headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    } catch { throw new HttpError(503, 'Database sementara tidak tersedia.'); }
    if (response.status === 404) return null;
    if (response.status === 401 || response.status === 403) throw new HttpError(403, 'Akses database ditolak.');
    if (!response.ok) throw new HttpError(503, 'Operasi database gagal; perubahan belum dikonfirmasi.');
    return response.json();
  }
  async get(collection: string, id: string) {
    const value = await this.request(`/${segment(collection)}/${segment(id)}`);
    return value ? document(value) : null;
  }
  async list(collection: string, pageToken?: string) {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const value = await this.request(`/${segment(collection)}?${params}`);
    return { documents: (value?.documents || []).map(document), nextPageToken: value?.nextPageToken };
  }
  async query(collection: string, field: string, value: string) {
    const rows = await this.request(':runQuery', 'POST', { structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } }, limit: 100 } });
    return (rows || []).filter((row: any) => row.document).map((row: any) => document(row.document));
  }
  async put(collection: string, id: string, data: RecordData) {
    const value = await this.request(`/${segment(collection)}/${segment(id)}`, 'PATCH', encode({ ...data, id, updatedAt: new Date().toISOString() }).mapValue);
    if (!value) throw new HttpError(503, 'Penyimpanan belum dikonfirmasi.');
    return document(value);
  }
}
