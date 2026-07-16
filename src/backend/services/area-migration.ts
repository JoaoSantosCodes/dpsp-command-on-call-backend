import { Pool, PoolClient } from 'pg';

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

export function normalizeForComparison(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics/accents
    .replace(/\s+/g, ' ')           // collapse multiple whitespace to single space
    .trim();
}

export function hasGarbledCharacters(name: string): boolean {
  if (name.includes('\uFFFD')) {
    return true;
  }
  if (name.includes('')) {
    return true;
  }
  return false;
}

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

export async function reassignReferences(
  client: PoolClient,
  dupCodigo: string,
  canonicalCodigo: string,
  dupNome?: string,
  canonicalNome?: string
): Promise<number> {
  let totalReassigned = 0;

  let res = await client.query(
    'UPDATE users SET area_codigo = $1 WHERE area_codigo = $2',
    [canonicalCodigo, dupCodigo]
  );
  totalReassigned += res.rowCount || 0;

  res = await client.query(
    'UPDATE periodos SET area_codigo = $1 WHERE area_codigo = $2',
    [canonicalCodigo, dupCodigo]
  );
  totalReassigned += res.rowCount || 0;

  res = await client.query(
    'UPDATE escalas SET area_codigo = $1 WHERE area_codigo = $2',
    [canonicalCodigo, dupCodigo]
  );
  totalReassigned += res.rowCount || 0;

  const conflicts = await client.query(
    `SELECT ua.id FROM user_areas ua
     WHERE ua.area_codigo = $1
     AND ua.user_id IN (SELECT user_id FROM user_areas WHERE area_codigo = $2)`,
    [canonicalCodigo, dupCodigo]
  );

  if (conflicts.rows.length > 0) {
    await client.query(
      `DELETE FROM user_areas
       WHERE area_codigo = $1
       AND user_id IN (SELECT user_id FROM user_areas WHERE area_codigo = $2)`,
      [dupCodigo, canonicalCodigo]
    );
  }

  res = await client.query(
    'UPDATE user_areas SET area_codigo = $1 WHERE area_codigo = $2',
    [canonicalCodigo, dupCodigo]
  );
  totalReassigned += res.rowCount || 0;

  if (dupNome && canonicalNome) {
    res = await client.query(
      'UPDATE escalation_schedules SET area = $1 WHERE area = $2',
      [canonicalNome, dupNome]
    );
    totalReassigned += res.rowCount || 0;
  }

  return totalReassigned;
}

export async function runDeduplication(db: Pool): Promise<MigrationResult> {
  const client = await db.connect();
  try {
    await client.query('BEGIN');

    const res = await client.query('SELECT id, codigo, nome, torre FROM areas');
    const allAreas = res.rows as AreaRecord[];

    const canonicals = allAreas.filter(a => CANONICAL_CODIGOS.includes(a.codigo));
    const nonCanonicals = allAreas.filter(a => !CANONICAL_CODIGOS.includes(a.codigo));

    let totalReferencesReassigned = 0;
    const toDelete: number[] = [];

    for (const dup of nonCanonicals) {
      const match = findCanonicalMatch(dup, canonicals);

      if (match) {
        totalReferencesReassigned += await reassignReferences(
          client,
          dup.codigo,
          match.codigo,
          dup.nome,
          match.nome
        );
        toDelete.push(dup.id);
      } else if (hasGarbledCharacters(dup.nome)) {
        const codigoMatch = canonicals.find(c =>
          normalizeForComparison(c.codigo) === normalizeForComparison(dup.codigo)
        );
        if (codigoMatch) {
          totalReferencesReassigned += await reassignReferences(
            client,
            dup.codigo,
            codigoMatch.codigo,
            dup.nome,
            codigoMatch.nome
          );
          toDelete.push(dup.id);
        }
      }
    }

    if (toDelete.length > 0) {
      await client.query(`DELETE FROM areas WHERE id = ANY($1)`, [toDelete]);
    }

    await client.query('COMMIT');
    return {
      duplicatesFound: toDelete.length,
      duplicatesRemoved: toDelete.length,
      referencesReassigned: totalReferencesReassigned,
    };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

