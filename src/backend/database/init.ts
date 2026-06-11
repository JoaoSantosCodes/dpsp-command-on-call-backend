import Database from 'better-sqlite3';

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

function createTables(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_order INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monitor_team_mapping (
      monitor_id INTEGER PRIMARY KEY,
      team_id TEXT NOT NULL,
      monitor_name TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      team_id TEXT NOT NULL REFERENCES teams(id),
      person_name TEXT NOT NULL,
      person_contact TEXT,
      date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(team_id, date, start_time)
    );

    CREATE TABLE IF NOT EXISTS escalation_chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      acknowledged_at TEXT,
      acknowledged_by TEXT,
      resolved_at TEXT,
      resolved_by TEXT
    );

    CREATE TABLE IF NOT EXISTS escalation_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      incident_id TEXT NOT NULL REFERENCES incidents(id),
      from_person TEXT NOT NULL,
      to_person TEXT NOT NULL,
      escalation_level INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Tb_Areas: Áreas de responsabilidade
    CREATE TABLE IF NOT EXISTS areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      torre TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    -- Tb_Usuario: Usuários do sistema
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      area_codigo TEXT,
      nome TEXT NOT NULL,
      perfil TEXT NOT NULL CHECK(perfil IN ('Adm', 'Responsavel', 'Plantonista')),
      cargo TEXT,
      username TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (area_codigo) REFERENCES areas(codigo)
    );

    -- Tb_Periodos: Períodos de plantão por área
    CREATE TABLE IF NOT EXISTS periodos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL,
      horarios TEXT NOT NULL,
      area_codigo TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (area_codigo) REFERENCES areas(codigo)
    );

    -- Tb_Escalas: Escalas vinculando área + período + usuário
    CREATE TABLE IF NOT EXISTS escalas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      area_codigo TEXT NOT NULL,
      periodo_codigo TEXT NOT NULL,
      usuario_codigo TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (area_codigo) REFERENCES areas(codigo),
      FOREIGN KEY (periodo_codigo) REFERENCES periodos(codigo),
      FOREIGN KEY (usuario_codigo) REFERENCES users(codigo)
    );

    -- Escalation schedules (imported from CSV, persisted)
    CREATE TABLE IF NOT EXISTS escalation_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
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
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_escalation_area_dia ON escalation_schedules(area, ano, mes, dia);

    -- Tb_User_Areas: Vinculação multi-área para Responsáveis
    CREATE TABLE IF NOT EXISTS user_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      area_codigo TEXT NOT NULL REFERENCES areas(codigo),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, area_codigo)
    );

    CREATE INDEX IF NOT EXISTS idx_user_areas_user ON user_areas(user_id);
    CREATE INDEX IF NOT EXISTS idx_user_areas_area ON user_areas(area_codigo);
  `);
}

function seedTeams(db: Database.Database): void {
  const insert = db.prepare(
    'INSERT OR IGNORE INTO teams (id, name, display_order) VALUES (?, ?, ?)'
  );

  const seedAll = db.transaction(() => {
    for (const team of TEAMS_SEED) {
      insert.run(team.id, team.name, team.displayOrder);
    }
  });

  seedAll();
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
];

function seedAreas(db: Database.Database): void {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO areas (codigo, nome, torre, created_at, updated_at) VALUES (?, ?, ?, datetime('now'), datetime('now'))"
  );

  const seedAll = db.transaction(() => {
    for (const area of AREAS_SEED) {
      insert.run(area.codigo, area.nome, area.torre);
    }
  });

  seedAll();
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
  // Common garbled characters from UTF-8 misinterpretation
  // ◆ (U+25C6) often appears when multi-byte UTF-8 is decoded as single-byte
  // Also check for other common mojibake patterns
  return /[◆◇■□▲△▼▽●○]/.test(str) || /[\u0080-\u009f]/.test(str);
}

/**
 * Removes duplicate areas that have garbled encoding (e.g., ◆ instead of ç/ã/õ).
 * Keeps the canonical AREAS_SEED entries and deletes CSV-imported duplicates
 * by comparing normalized forms of both the area codigo and nome fields,
 * and also removing entries with garbled characters.
 */
function deduplicateAreas(db: Database.Database): void {
  const canonicalCodigos = AREAS_SEED.map((a) => a.codigo);

  const dedup = db.transaction(() => {
    // Get all areas currently in the database
    const allAreas = db.prepare('SELECT id, codigo, nome FROM areas').all() as Array<{
      id: number;
      codigo: string;
      nome: string;
    }>;

    // Build a set of normalized names AND normalized codigos from canonical entries
    const canonicalNormalizedNomes = new Set<string>();
    const canonicalNormalizedCodigos = new Set<string>();
    for (const area of allAreas) {
      if (canonicalCodigos.includes(area.codigo)) {
        canonicalNormalizedNomes.add(normalizeForComparison(area.nome));
        canonicalNormalizedCodigos.add(normalizeForComparison(area.codigo));
      }
    }

    // Find non-canonical areas that are duplicates:
    // 1. Their normalized nome or codigo matches a canonical one, OR
    // 2. They contain garbled characters (broken encoding artifacts)
    const idsToDelete: number[] = [];
    for (const area of allAreas) {
      if (canonicalCodigos.includes(area.codigo)) {
        continue; // skip canonical entries
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

    // Delete the duplicates
    if (idsToDelete.length > 0) {
      const placeholders = idsToDelete.map(() => '?').join(',');
      db.prepare(`DELETE FROM areas WHERE id IN (${placeholders})`).run(...idsToDelete);
    }
  });

  dedup();
}

export function initializeDatabase(dbPath?: string): Database.Database {
  const path = dbPath || './data/command-center.db';

  // Criar diretório se não existir
  const dir = path.substring(0, path.lastIndexOf('/'));
  if (dir) {
    const fs = require('fs');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(path);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Create all tables
  createTables(db);

  // Seed teams
  seedTeams(db);

  // Seed areas
  seedAreas(db);

  // Deduplicate areas (remove garbled CSV-imported duplicates)
  deduplicateAreas(db);

  return db;
}

export { TEAMS_SEED, normalizeForComparison, deduplicateAreas, hasGarbledCharacters };
