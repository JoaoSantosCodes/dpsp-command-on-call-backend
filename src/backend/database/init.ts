import { Pool } from 'pg';

const TEAMS_SEED = [
  { id: 'team-alpha', name: 'Time Alpha', displayOrder: 1 },
  { id: 'team-bravo', name: 'Time Bravo', displayOrder: 2 },
  { id: 'team-charlie', name: 'Time Charlie', displayOrder: 3 },
  { id: 'team-delta', name: 'Time Delta', displayOrder: 4 },
  { id: 'team-echo', name: 'Time Echo', displayOrder: 5 },
  { id: 'team-foxtrot', name: 'Time Foxtrot', displayOrder: 6 },
  { id: 'team-golf', name: 'Time Golf', displayOrder: 7 },
  { id: 'team-hotel', name: 'Time Hotel', displayOrder: 8 },
  { id: 'team-india', name: 'Time India', displayOrder: 9 },
  { id: 'team-juliet', name: 'Time Juliet', displayOrder: 10 },
  { id: 'team-kilo', name: 'Time Kilo', displayOrder: 11 },
];

async function createTables(db: Pool): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monitor_team_mapping (
      monitor_id INTEGER PRIMARY KEY,
      team_id TEXT NOT NULL,
      monitor_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id SERIAL PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id),
      person_name TEXT NOT NULL,
      person_contact TEXT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(team_id, date, start_time)
    );

    CREATE TABLE IF NOT EXISTS escalation_chains (
      id SERIAL PRIMARY KEY,
      team_id TEXT NOT NULL REFERENCES teams(id),
      person_name TEXT NOT NULL,
      person_contact TEXT,
      position INTEGER NOT NULL,
      UNIQUE(team_id, position)
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id TEXT PRIMARY KEY,
      monitor_id INTEGER NOT NULL,
      monitor_name TEXT NOT NULL,
      team_id TEXT NOT NULL,
      on_call_person TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      started_at TIMESTAMP NOT NULL DEFAULT NOW(),
      acknowledged_at TIMESTAMP,
      acknowledged_by TEXT,
      resolved_at TIMESTAMP,
      resolved_by TEXT
    );

    CREATE TABLE IF NOT EXISTS escalation_events (
      id SERIAL PRIMARY KEY,
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      from_person TEXT NOT NULL,
      to_person TEXT NOT NULL,
      escalation_level INTEGER NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS areas (
      id SERIAL PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      torre TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      coordenador_nome TEXT,
      coordenador_contato TEXT,
      gerente_nome TEXT,
      gerente_contato TEXT
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      area_codigo TEXT,
      nome TEXT NOT NULL,
      perfil TEXT NOT NULL CHECK(perfil IN ('Adm', 'Responsavel', 'Plantonista', 'Consultor')),
      nivel_escalonamento TEXT,
      cargo TEXT,
      contato TEXT,
      username TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      ativo INTEGER NOT NULL DEFAULT 1,
      aprovado INTEGER NOT NULL DEFAULT 1,
      area_solicitada TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (area_codigo) REFERENCES areas(codigo)
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      menu TEXT NOT NULL,
      can_read BOOLEAN NOT NULL DEFAULT TRUE,
      can_edit BOOLEAN NOT NULL DEFAULT FALSE,
      can_delete BOOLEAN NOT NULL DEFAULT FALSE,
      UNIQUE(user_id, menu)
    );

    CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id);

    CREATE TABLE IF NOT EXISTS periodos (
      id SERIAL PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL,
      horarios TEXT NOT NULL,
      area_codigo TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (area_codigo) REFERENCES areas(codigo)
    );

    CREATE TABLE IF NOT EXISTS escalas (
      id SERIAL PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      area_codigo TEXT NOT NULL,
      periodo_codigo TEXT NOT NULL,
      usuario_codigo TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW(),
      FOREIGN KEY (area_codigo) REFERENCES areas(codigo),
      FOREIGN KEY (periodo_codigo) REFERENCES periodos(codigo),
      FOREIGN KEY (usuario_codigo) REFERENCES users(codigo)
    );

    CREATE TABLE IF NOT EXISTS escalation_schedules (
      id SERIAL PRIMARY KEY,
      area TEXT NOT NULL,
      colaborador TEXT NOT NULL,
      cargo TEXT,
      nivel TEXT,
      contato TEXT,
      dia INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      horario_inicio TEXT NOT NULL,
      horario_fim TEXT NOT NULL,
      is_24h INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_escalation_area_dia ON escalation_schedules(area, ano, mes, dia);

    CREATE TABLE IF NOT EXISTS user_areas (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      area_codigo TEXT NOT NULL REFERENCES areas(codigo),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, area_codigo)
    );

    CREATE INDEX IF NOT EXISTS idx_user_areas_user ON user_areas(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_areas_area ON user_areas(area_codigo);

    CREATE TABLE IF NOT EXISTS area_escalation_chains (
      id SERIAL PRIMARY KEY,
      area_codigo TEXT NOT NULL REFERENCES areas(codigo),
      person_name TEXT NOT NULL,
      person_contact TEXT,
      position INTEGER NOT NULL,
      UNIQUE(area_codigo, position)
    );

    CREATE INDEX IF NOT EXISTS idx_area_esc_chain_area ON area_escalation_chains(area_codigo);

    CREATE TABLE IF NOT EXISTS monitor_area_mapping (
      monitor_id INTEGER PRIMARY KEY,
      area_codigo TEXT NOT NULL REFERENCES areas(codigo),
      monitor_name TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_monitor_area ON monitor_area_mapping(area_codigo);

    CREATE TABLE IF NOT EXISTS problemas (
      id SERIAL PRIMARY KEY,
      codigo TEXT NOT NULL UNIQUE,
      descricao TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS problema_areas (
      id SERIAL PRIMARY KEY,
      problema_id INTEGER NOT NULL REFERENCES problemas(id) ON DELETE CASCADE,
      area_codigo TEXT NOT NULL REFERENCES areas(codigo),
      ordem INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(problema_id, area_codigo),
      UNIQUE(problema_id, ordem)
    );

    CREATE INDEX IF NOT EXISTS idx_problema_areas_problema ON problema_areas(problema_id);
    CREATE INDEX IF NOT EXISTS idx_problema_areas_area ON problema_areas(area_codigo);

    CREATE TABLE IF NOT EXISTS contato_log (
      id SERIAL PRIMARY KEY,
      plantonista TEXT NOT NULL,
      area_codigo TEXT NOT NULL,
      problema_codigo TEXT,
      data TEXT NOT NULL,
      hora TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pendente', 'atendido', 'nao_atendido')),
      registrado_por TEXT,
      observacao TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_contato_log_data ON contato_log(data);
    CREATE INDEX IF NOT EXISTS idx_contato_log_area ON contato_log(area_codigo, data);

    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents(status);
    CREATE INDEX IF NOT EXISTS idx_incidents_started_at ON incidents(started_at);
    CREATE INDEX IF NOT EXISTS idx_users_area ON users(area_codigo);
    CREATE INDEX IF NOT EXISTS idx_escalas_area ON escalas(area_codigo);
    CREATE INDEX IF NOT EXISTS idx_escalas_periodo ON escalas(periodo_codigo);
    CREATE INDEX IF NOT EXISTS idx_periodos_area_data ON periodos(area_codigo, data);
  `);
}

async function seedTeams(db: Pool): Promise<void> {
  for (const team of TEAMS_SEED) {
    await db.query(
      'INSERT INTO teams (id, name, display_order) VALUES ($1, $2, $3) ON CONFLICT (id) DO NOTHING',
      [team.id, team.name, team.displayOrder]
    );
  }
}

const AREAS_SEED = [
  { codigo: 'INFRAESTRUTURA_DATA_CENTER', nome: 'Infraestrutura Data Center', torre: null },
  { codigo: 'DEVOPS_CLOUD', nome: 'DevOps/Cloud', torre: null },
  { codigo: 'REDES', nome: 'Redes', torre: null },
  { codigo: 'TORRE_SOLUCOES_DE_SAUDE', nome: 'Torre Soluções de Saúde', torre: null },
  { codigo: 'INTEGRACOES__CPI_ODI_OGG_', nome: 'Integrações (CPI/ODI/OGG)', torre: null },
  { codigo: 'TORRE_SOLUCOES_COM_E_MARKETING', nome: 'Torre Soluções Com e Marketing', torre: null },
  { codigo: 'TORRE_SOLUCOES_LOGISTICAS', nome: 'Torre Soluções Logísticas', torre: null },
  { codigo: 'TORRE_SOLUCOES_DE_LOJAS', nome: 'Torre Soluções de Lojas', torre: null },
  { codigo: 'BDE_ODI___MALHA_DE_PRECOS', nome: 'BDE/ODI - Malha de Preços', torre: null },
  { codigo: 'SEGURANCA_DA_INFORMACAO', nome: 'Segurança da Informação', torre: null },
  { codigo: 'COMMAND_CENTER', nome: 'Command Center', torre: null },
  { codigo: 'SOLUCOES_CORPORATIVAS', nome: 'Soluções Corporativas', torre: null },
  { codigo: 'PDV', nome: 'PDV', torre: null },
  { codigo: 'BALCAO', nome: 'Balcão', torre: null },
  { codigo: 'TORRE_SOLUCOES_DIGITAIS', nome: 'Torre Soluções Digitais', torre: null },
  { codigo: 'PENDENTE_APROVACAO', nome: 'Pendente de Aprovação', torre: null },
];

async function seedAreas(db: Pool): Promise<void> {
  for (const area of AREAS_SEED) {
    await db.query(
      "INSERT INTO areas (codigo, nome, torre, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW()) ON CONFLICT (codigo) DO NOTHING",
      [area.codigo, area.nome, area.torre]
    );
  }
}

/**
 * Normalizes a string for comparison by lowercasing, stripping accents/diacritics,
 * and removing all non-alphanumeric characters.
 */
function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip diacritics/accents
    .replace(/[^a-z0-9]/g, '');     // remove non-alphanumeric
}

/**
 * Checks if a string contains garbled/corrupted characters that indicate
 * a broken encoding (e.g., ◆, Ã, â€, etc. instead of proper Portuguese accents).
 */
function hasGarbledCharacters(str: string): boolean {
  return /[◆◇■□▲△▼▽●○]/.test(str) || /[\u0080-\u009f]/.test(str);
}

async function deduplicateAreas(db: Pool): Promise<void> {
  const canonicalCodigos = AREAS_SEED.map((a) => a.codigo);

  const res = await db.query('SELECT id, codigo, nome FROM areas');
  const allAreas = res.rows as Array<{ id: number; codigo: string; nome: string; }>;

  const canonicalNormalizedNomes = new Set<string>();
  const canonicalNormalizedCodigos = new Set<string>();
  for (const area of allAreas) {
    if (canonicalCodigos.includes(area.codigo)) {
      canonicalNormalizedNomes.add(normalizeForComparison(area.nome));
      canonicalNormalizedCodigos.add(normalizeForComparison(area.codigo));
    }
  }

  const idsToDelete: number[] = [];
  for (const area of allAreas) {
    if (canonicalCodigos.includes(area.codigo)) {
      continue;
    }
    const normalizedNome = normalizeForComparison(area.nome);
    const normalizedCodigo = normalizeForComparison(area.codigo);

    const matchesCanonicalNome = canonicalNormalizedNomes.has(normalizedNome);
    const matchesCanonicalCodigo = canonicalNormalizedCodigos.has(normalizedCodigo);
    const isGarbled = hasGarbledCharacters(area.nome);

    if (matchesCanonicalNome || matchesCanonicalCodigo || isGarbled) {
      idsToDelete.push(area.id);
    }
  }

  if (idsToDelete.length > 0) {
    await db.query(`DELETE FROM areas WHERE id = ANY($1)`, [idsToDelete]);
  }
}

export async function initializeDatabase(db?: Pool): Promise<Pool> {
  if (!db) {
    db = new Pool({
      connectionString: process.env.DATABASE_URL
    });
  }

  await createTables(db);
  await seedTeams(db);
  await seedAreas(db);
  await deduplicateAreas(db);

  return db;
}

export { TEAMS_SEED, normalizeForComparison, deduplicateAreas, hasGarbledCharacters };
