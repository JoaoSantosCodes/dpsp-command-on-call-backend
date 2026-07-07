/**
 * Normalizes a string for comparison by removing accents, special chars,
 * lowercasing, and collapsing whitespace.
 *
 * Used for matching area names across different encodings/formats.
 * Example: "TORRE SOLUÇÕES LOGÍSTICAS" → "torre solucoes logisticas"
 */
export function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics/accents
    .replace(/[^a-z0-9\s]/g, '')     // remove non-alphanumeric (keep spaces)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a string contains garbled/corrupted characters indicating
 * broken encoding (e.g., mojibake from UTF-8 misinterpretation).
 */
export function hasGarbledCharacters(str: string): boolean {
  if (str.includes('\uFFFD')) return true;
  if (str.includes('�')) return true;
  if (/[◆◇■□▲△▼▽●○]/.test(str)) return true;
  if (/[\u0080-\u009f]/.test(str)) return true;
  return false;
}
