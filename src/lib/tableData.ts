export function filterAndSortTableRows<T extends Record<string, unknown>>(
  data: T[],
  columns: Array<{ key: string }>,
  search: string,
  sort: { key: string | null; dir: 'asc' | 'desc' }
): T[] {
  const query = search.trim().toLocaleLowerCase();
  const filtered = query
    ? data.filter(row => columns.some(column => String(row[column.key] ?? '').toLocaleLowerCase().includes(query)))
    : data;
  const sortKey = sort.key;
  if (!sortKey) return filtered;
  return [...filtered].sort((a, b) => sort.dir === 'asc'
    ? String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''))
    : String(b[sortKey] ?? '').localeCompare(String(a[sortKey] ?? '')));
}

export function paginateTableRows<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}
