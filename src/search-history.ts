const key = 'crayon-player:search-history:v1';

function clean(values: readonly unknown[]): string[] {
  const names = values.filter((value): value is string => typeof value === 'string').map(value => value.trim());
  return [...new Set(names.filter(value => value.length > 0 && value.length <= 80 && !/^https?:\/\//i.test(value)))].slice(0, 20);
}

/** Storage can be unavailable in embedded or private browsing contexts. */
export function readSearchHistory(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(saved) ? clean(saved) : [];
  } catch { return []; }
}

export function writeSearchHistory(values: readonly string[]): string[] {
  const entries = clean(values);
  try { localStorage.setItem(key, JSON.stringify(entries)); } catch { /* Keep the current session usable. */ }
  return entries;
}
