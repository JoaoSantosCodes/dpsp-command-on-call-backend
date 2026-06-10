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

export function initializeDatabase(dbPath?: string): Database.Database {
  const db = new Database(dbPath || './data/command-center.db');

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

  return db;
}

export { TEAMS_SEED };
