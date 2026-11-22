# Staff Engineer — cloudflare-migration
- Ikuti pola adapter yang ada (assertEntity, assertRecordId, serializePayload, errorText).
- Tabel D1 bernama sama dengan MYSQL_TABLES.
- Jangan ubah perilaku mode lain; perubahan server.ts minimal (guard auto-listen, izinkan d1 untuk local auth).
- Konfigurasi rahasia via wrangler secret, bukan di wrangler.jsonc.
