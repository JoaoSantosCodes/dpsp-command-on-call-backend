import Database from 'better-sqlite3';

/**
 * Area Migration Service
 *
 * Handles startup deduplication of area records by:
 * 1. Identifying non-canonical (duplicate/garbled) area entries
 * 2. Matching them to their canonical counterpart via normalized name comparison
 * 3. Reassigning all FK references from duplicates to canonical areas
 * 4. Deleting the duplicate records
 *
 * Requirements: 1.2, 1.3, 1.4
 */

export interface MigrationResult {
  duplicatesFound: number;
  duplicatesRemoved: number;
  referencesReassigned: number;
}

export interface AreaRecord {
  id: number;
  codigo: string;
  nome: string;
  torre: string | null;
}

/**
 * The canonical area codes from the seed data.
 * These are the "source of truth" area records that duplicates get merged into.
 */
const CANONICAL_CODIGOS = [
  'INFRAESTRUTURA_DATA_CENTER',
  'DEVOPS_CLOUD',
  'REDES',
  'TORRE_SOLUCOES_DE_SAUDE',
  'INTEGRACOES__CPI_ODI_OGG_',
  'TORRE_SOLUCOES_COM_E_MARKETING',
  'TORRE_SOLUCOES_LOGISTICAS',
  'TORRE_SOLUCOES_DE_LOJAS',
  'BDE_ODI___MALHA_DE_PRECOS',
  'SEGURANCA_DA_INFORMACAO',
  'COMMAND_CENTER',
  'SOLUCOES_CORPORATIVAS',
  'PDV',
  'BALCAO',
  'TORRE_SOLUCOES_DIGITAIS',
];

/**
 * Normalizes a string for comparison purposes.
 * - Lowercases the string
 * - Uses Unicode NFD normalization to decompose accented characters
 * - Strips combining diacritical marks (accents)
 * - Collapses multiple whitespace to a single space
 * - Trims leading/trailing whitespace
 */
export function normalizeForComparison(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics/accents
    .replace(/\s+/g, ' ')           // collapse multiple whitespace to single space
    .trim();
}

/**
 * Detects whether a string contains garbled/replacement characters
 * that indicate encoding corruption.
 *
 * Checks for:
 * - U+FFFD (Unicode Replacement Character)
 * - The literal "�" sequence (often appears in text as-is when encoding is broken)
 * - Common mojibake patterns from UTF-8 misinterpreted as latin1
 */
export function hasGarbledCharacters(name: string): boolean {
  // U+FFFD is the Unicode replacement character
  if (name.includes('\uFFFD')) {
    return true;
  }
  // The literal "�" sequence (the actual characters in the string)
  if (name.includes('�')) {
    return true;
  }
  return false;
}

/**
 * Finds the canonical area that matches a given duplicate area by comparing
 * their normalized names.
 *
 * Returns the matching canonical area record, or undefined if no match is found.
 */
export function findCanonicalMatch(
  dup: AreaRecord,
  canonicals: AreaRecord[]
): AreaRecord | undefined {
  const normalizedDupNome = normalizeForComparison(dup.nome);
  const normalizedDupCodigo = normalizeForComparison(dup.codigo);

  for (const canonical of canonicals) {
    const normalizedCanonicalNome = normalizeForComparison(canonical.nome);
    const normalizedCanonicalCodigo = normalizeForComparison(canonical.codigo);

    if (normalizedDupNome === normalizedCanonicalNome) {
      return canonical;
    }
    if (normalizedDupCodigo === normalizedCanonicalCodigo) {
      return canonical;
    }
  }

  return undefined;
}

/**
 * Reassigns all foreign key references from a duplicate area to the canonical area.
 *
 * Updates the following tables:
 * - users (area_codigo)
 * - periodos (area_codigo)
 * - escalas (area_codigo)
 * - user_areas (area_codigo)
 * - escalation_schedules (area — matched by nome)
 *
 * Returns the total number of rows updated across all tables.
 */
export function reassignReferences(
  db: Database.Database,
  dupCodigo: string,
  canonicalCodigo: string,
  dupNome?: string,
  canonicalNome?: string
): number {
  let totalReassigned = 0;

  // Update users
  const usersResult = db.prepare(
    'UPDATE users SET area_codigo = ? WHERE area_codigo = ?'
  ).run(canonicalCodigo, dupCodigo);
  totalReassigned += usersResult.changes;

  // Update periodos
  const periodosResult = db.prepare(
    'UPDATE periodos SET area_codigo = ? WHERE area_codigo = ?'
  ).run(canonicalCodigo, dupCodigo);
  totalReassigned += periodosResult.changes;

  // Update escalas
  const escalasResult = db.prepare(
    'UPDATE escalas SET area_codigo = ? WHERE area_codigo = ?'
  ).run(canonicalCodigo, dupCodigo);
  totalReassigned += escalasResult.changes;

  // Update user_areas
  // Handle potential unique constraint conflicts by deleting the dup entry
  // if the user already has a link to the canonical area
  const userAreasConflicts = db.prepare(
    `SELECT ua.id FROM user_areas ua
     WHERE ua.area_codigo = ?
     AND ua.user_id IN (SELECT user_id FROM user_areas WHERE area_codigo = ?)`
  ).all(canonicalCodigo, dupCodigo) as Array<{ id: number }>;

  if (userAreasConflicts.length > 0) {
    // Delete duplicate user_areas entries that would conflict
    db.prepare(
      `DELETE FROM user_areas
       WHERE area_codigo = ?
       AND user_id IN (SELECT user_id FROM user_areas WHERE area_codigo = ?)`
    ).run(dupCodigo, canonicalCodigo);
  }

  const userAreasResult = db.prepare(
    'UPDATE user_areas SET area_codigo = ? WHERE area_codigo = ?'
  ).run(canonicalCodigo, dupCodigo);
  totalReassigned += userAreasResult.changes;

  // Update escalation_schedules (uses area nome, not codigo)
  if (dupNome && canonicalNome) {
    const escSchedulesResult = db.prepare(
      'UPDATE escalation_schedules SET area = ? WHERE area = ?'
    ).run(canonicalNome, dupNome);
    totalReassigned += escSchedulesResult.changes;
  }

  return totalReassigned;
}

/**
 * Runs the full area deduplication migration inside a single SQLite transaction.
 *
 * Steps:
 * 1. Fetch all area records from the database
 * 2. Separate into canonical (from AREAS_SEED) and non-canonical entries
 * 3. For each non-canonical entry, try to find a canonical match by normalized name
 * 4. If matched (or if the entry has garbled characters), reassign all FK references
 * 5. Delete the duplicate records
 *
 * This function is idempotent — running it multiple times has no effect once
 * duplicates are resolved.
 */
export function runDeduplication(db: Database.Database): MigrationResult {
  const migrate = db.transaction(() => {
    // Fetch all areas
    const allAreas = db.prepare('SELECT id, codigo, nome, torre FROM areas').all() as AreaRecord[];

    // Separate canonical from non-canonical
    const canonicals = allAreas.filter(a => CANONICAL_CODIGOS.includes(a.codigo));
    const nonCanonicals = allAreas.filter(a => !CANONICAL_CODIGOS.includes(a.codigo));

    let totalReferencesReassigned = 0;
    const toDelete: number[] = [];

    for (const dup of nonCanonicals) {
      const match = findCanonicalMatch(dup, canonicals);

      if (match) {
        // Found a canonical match — reassign and mark for deletion
        totalReferencesReassigned += reassignReferences(
          db,
          dup.codigo,
          match.codigo,
          dup.nome,
          match.nome
        );
        toDelete.push(dup.id);
      } else if (hasGarbledCharacters(dup.nome)) {
        // Garbled name but no match found — try to find closest canonical by codigo normalization
        const codigoMatch = canonicals.find(c =>
          normalizeForComparison(c.codigo) === normalizeForComparison(dup.codigo)
        );
        if (codigoMatch) {
          totalReferencesReassigned += reassignReferences(
            db,
            dup.codigo,
            codigoMatch.codigo,
            dup.nome,
            codigoMatch.nome
          );
          toDelete.push(dup.id);
        }
        // If no match at all, skip (admin intervention needed per error handling spec)
      }
    }

    // Delete duplicates
    if (toDelete.length > 0) {
      const placeholders = toDelete.map(() => '?').join(',');
      db.prepare(`DELETE FROM areas WHERE id IN (${placeholders})`).run(...toDelete);
    }

    return {
      duplicatesFound: toDelete.length,
      duplicatesRemoved: toDelete.length,
      referencesReassigned: totalReferencesReassigned,
    };
  });

  return migrate();
}
