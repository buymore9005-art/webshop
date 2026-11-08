export type Locale = 'id' | 'en' | 'zh';
export function normalizeLocale(value: unknown): Locale {
  return value === 'en' || value === 'zh' ? value : 'id';
}
export function readLocale(storage: Pick<Storage, 'getItem'> | undefined, key: string): Locale {
  try { return normalizeLocale(storage?.getItem(key)); }
  catch { return 'id'; }
}
export function writeLocale(storage: Pick<Storage, 'setItem'> | undefined, key: string, locale: Locale): void {
  try { storage?.setItem(key, locale); }
  catch { /* Language switching remains available when storage is blocked. */ }
}