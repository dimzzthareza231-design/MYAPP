# Backend nyata untuk modul mock (hybrid klinik/RS, multi-cabang)

Status: rencana, belum diimplementasi.

## Kondisi saat ini
- `migrations/0001_init.sql`: 15 tabel `(id, payload JSON, updated_at)`; tanpa branch, version, soft delete.
- `src/server/databaseAdapter.ts`: `PersistenceRepository` (get/list/commit) dengan adapter Memory, MySQL, D1, Firebase, Hybrid.
- `src/server/coreAuth.ts`: `scopeForPath()` + `hasScope()` dengan `ROLES` di `src/data/roles.ts`. Path tak terdaftar = 404. `CorePrincipal` belum punya cabang.
- `src/data/operatingModes.ts`: mode `SIMK | SIMRS`, hanya ditegakkan di UI.
- ~30 modul staf masih murni mock (data.ts lokal + localStorage).

## 1. Pola backend: hybrid
- **Generic store** (`module_records`) untuk data dokumen ber-trafik rendah: CP, CRM, CSSD, Gizi, Rehab, Safety, Telemed, Panduan, log Backup, konfigurasi/log JKN & Bridging, QC/analyzer lab, stok Bank Darah, chart ICU.
- **Tabel khusus** untuk data lintas modul, punya state machine, uang, atau obat: order & hasil lab, resep & dispensing, order radiologi, admisi & bed, booking OK, billing, mutasi stok.

`migrations/0002_core_platform.sql`:
```sql
CREATE TABLE branches(id TEXT PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  facility_type TEXT NOT NULL CHECK(facility_type IN('klinik_pratama','klinik_utama','rs')),
  operating_mode TEXT NOT NULL CHECK(operating_mode IN('SIMK','SIMRS')),
  enabled_modules TEXT CHECK(json_valid(enabled_modules)),
  active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL);
CREATE TABLE user_branches(user_id TEXT, branch_id TEXT REFERENCES branches(id),
  is_default INTEGER DEFAULT 0, PRIMARY KEY(user_id,branch_id));
CREATE TABLE module_records(id TEXT NOT NULL, module TEXT NOT NULL, collection TEXT NOT NULL,
  branch_id TEXT NOT NULL REFERENCES branches(id), data TEXT NOT NULL CHECK(json_valid(data)),
  version INTEGER NOT NULL DEFAULT 1, created_by TEXT, updated_by TEXT, created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL, deleted_at TEXT, PRIMARY KEY(module,collection,id));
CREATE INDEX idx_mr_scope ON module_records(module,collection,branch_id,deleted_at,updated_at);
CREATE TABLE record_audit(id INTEGER PRIMARY KEY AUTOINCREMENT, table_name TEXT, record_key TEXT,
  branch_id TEXT, action TEXT CHECK(action IN('create','update','delete','restore')),
  actor_uid TEXT, actor_role TEXT, version INTEGER, diff TEXT, at TEXT NOT NULL);
```
- `0003_clinical_core.sql`: `lab_orders`, `lab_results`, `rad_orders`, `prescriptions_v2`, `prescription_items`, `stock_items`, `stock_movements`, `admissions`, `beds_v2`, `ok_bookings`, `invoices`, `invoice_lines`, `payments` (semua dengan `branch_id`, `version`, `deleted_at`).
- `0004_master_data.sql`: tabel master.

Server (file baru): `src/server/modules/moduleStore.ts` (D1/MySQL/Memory; Firebase/Hybrid → 501), `collections.ts` (registry `{module, collection, scope, schema, hospitalOnly, writeRoles}`), `router.ts`.

Route `/api/v1/modules/:module/:collection`: GET list (`since`, `cursor`, `limit`), GET `/:id`, POST, PUT `/:id` dengan `If-Match` (409 `VERSION_CONFLICT`), DELETE (soft).
- Validasi zod per koleksi; koleksi tak dikenal → 404.
- Header `X-Branch-Id` divalidasi ke `user_branches`; server memaksa `branch_id`, body tidak dipercaya.
- Tiap write + baris `record_audit` dalam satu D1 batch.
- Urutan gerbang: RBAC (`hasScope`) → `writeRoles` → 403 `MODULE_DISABLED_IN_MODE` bila mode/`enabled_modules` cabang menolak.

## 2. Klien
- `src/hooks/useModuleCollection.ts` → `[items, {create, update, remove, loading, error, conflict, refetch}]`, optimistic + rollback, 409 → toast + refetch.
- `src/lib/moduleApi.ts` (fetch + header cabang), `src/contexts/BranchContext.tsx` (cabang aktif, mode, modul aktif).
- Cache baca opsional di IndexedDB; write klinis tidak diantrikan offline.
- Migrasi modul: ganti `useState(localStorage ?? MOCK)` dengan `useModuleCollection<T>('modul','koleksi')`; empty state menggantikan mock.

## 3. Gerbang hybrid
- `getModuleAvailability(moduleId, {mode, facilityType, enabledModules})` di `src/data/operatingModes.ts`, dipakai UI dan server.
- `HOSPITAL_ONLY`: rawat inap, ICU, kamar operasi, CSSD, gizi, apotek ranap, bed management.
- `klinik_utama` boleh mengaktifkan rehab, lab, radiologi, IGD. Admin bisa mematikan modul per cabang.

## 4. Data master
- `m_poliklinik`, `m_tariff` (branch_id null = global), `m_formulary`, `m_icd10`, `m_icd9cm`, `m_lab_catalog`, `m_rad_catalog`, `m_bpjs_poli_map`, `m_payer`.
- Seed hanya data referensi netral (ICD, kode poli BPJS, LOINC). Tarif & formularium kosong, diisi faskes.
- `GET/PUT /api/v1/master/:table` (tulis: admin).
- Ekstrak data referensi asli dari file demo bersama, hapus pasien/pegawai palsu. `tests/noFakeData.test.ts` menjaga.

## 5. Batch (file tidak saling tumpang)
- **Batch 0** (berurutan): `0002`, `src/server/modules/*`, hook, moduleApi, BranchContext, operatingModes, 1 baris di `coreAuth.ts` dan `createApps`, `package.json` (zod), file registry kosong `collections/batch{1..4}.ts`.
- **Batch 1** (generic store): QC/BDRS lab, CP, CRM, CSSD, Gizi, Rehab, Safety, Telemed, Panduan, Backup.
- **Batch 2** (klinis inti): worklist & hasil lab, Radiologi, Farmasi, Kamar Operasi, Ranap, Bed Management, ICU, IGD + `0003` + `src/server/clinical/*`.
- **Batch 3** (keuangan & penjamin, setelah `0003`): Finance, Billing, AnalyticsDashboard, BPJS, JKNMobile, Bridging, Inventory + `src/server/finance/*`.
- **Batch 4** (admin & lintas modul): MultiBranch, ManajemenSDM, AuditTrail, tab arsip RME, context AuditTrail/Notification/PatientFlow/Workflow, `0004` + pembersihan `src/data/*`.

## 6. Pengujian
- `tests/moduleStore.test.ts`: CRUD, konflik versi, soft delete, isolasi cabang, audit per write.
- `tests/moduleRoutes.test.ts`: 401/403 per peran, viewer read-only, `MODULE_DISABLED_IN_MODE`, `branch_id` palsu diabaikan, 400 skema.
- Tes domain per batch: stok tidak negatif, bed tidak ganda, total invoice benar.
- Migrasi `0001`–`0004` diterapkan berurutan di CI. `npm run typecheck && npm test` menggerbangi tiap batch.
