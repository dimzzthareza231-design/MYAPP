import { useState, type Dispatch, type SetStateAction } from 'react';
// Business state is session memory only, not a cross-user localStorage database.
// The authoritative clinical records live in Firestore. Legacy modules that use
// these helpers are previews until their writes have been migrated and tested.
const values = new Map<string, unknown>();
export function resetSessionStorage() { values.clear(); }
function read<T>(key: string, fallback?: T): T { return (values.has(key) ? values.get(key) : fallback) as T; }
function write(key: string, value: unknown) { values.set(key, value); }
export function useStorage<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => read(key, initial));
  const update: Dispatch<SetStateAction<T>> = next => setValue(previous => {
    const resolved = typeof next === 'function' ? (next as (old: T) => T)(previous) : next;
    write(key, resolved); return resolved;
  });
  return [value, update];
}
export const storage = {
  get: <T = any>(key: string, fallback?: any): T => read<T>(key, fallback),
  getItem: <T = any>(key: string, fallback?: any): T => read<T>(key, fallback),
  set: write, setItem: write, remove: (key: string) => { values.delete(key); }, clear: resetSessionStorage,
};
export default storage;
