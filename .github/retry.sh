#!/usr/bin/env bash
# Ulangi perintah Cloudflare hanya bila API membalas rate limit (code 10429), jeda 30/60/90 detik.
# Kegagalan lain langsung gagal, agar deploy yang mungkin sudah terpasang tidak diulang membabi buta.
log="$(mktemp)"
for attempt in 1 2 3 4; do
  "$@" 2>&1 | tee "$log"
  status=${PIPESTATUS[0]}
  [ "$status" -eq 0 ] && exit 0
  if ! grep -qE 'code: 10429|Rate limited' "$log"; then exit "$status"; fi
  [ "$attempt" -lt 4 ] && { echo "::warning::Rate limit Cloudflare (percobaan $attempt): $*; ulang dalam $((attempt * 30)) detik." >&2; sleep $((attempt * 30)); }
done
echo "::error::Masih kena rate limit Cloudflare setelah 4 percobaan: $*" >&2
exit 1
