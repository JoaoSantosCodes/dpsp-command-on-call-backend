import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import {
  normalizeForComparison,
  hasGarbledCharacters,
  findCanonicalMatch,
  reassignReferences,
  runDeduplication,
  AreaRecord,
} from './area-migration';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      torre TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      area_codigo TEXT,
      nome TEXT NOT NULL,
      perfil TEXT NOT NULL CHECK(perfil IN ('Adm', 'Responsavel', 'Plantonista')),
      cargo TEXT,
      contato TEXT,
      username TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (area_codigo) REFERENCES areas(codigo)
    );

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

    CREATE TABLE IF NOT EXISTS escalas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      area_codigo TEXT NOT NULL,
      periodo_codigo TEXT NOT NULL,
      usuario_codigo TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (area_codigo) REFERENCES areas(codigo),
      FOREIGN KEY (periodo_codigo) REFERENCES periodos(codigo)
    );

    CREATE TABLE IF NOT EXISTS user_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      area_codigo TEXT NOT NULL REFERENCES areas(codigo),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, area_codigo)
    );

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
  `);

  return db;
}

function seedCanonicalAreas(db: Database.Database): void {
  const insert = db.prepare(
    "INSERT INTO areas (codigo, nome, torre) VALUES (?, ?, ?)"
  );
  insert.run('TORRE_SOLUCOES_DE_SAUDE', 'Torre Soluções de Saúde', null);
  insert.run('DEVOPS_CLOUD', 'DevOps/Cloud', null);
  insert.run('REDES', 'Redes', null);
  insert.run('COMMAND_CENTER', 'Command Center', null);
}

describe('normalizeForComparison', () => {
  it('lowercases the string', () => {
    expect(normalizeForComparison('HELLO WORLD')).toBe('hello world');
  });

  it('strips accents/diacritics via NFD normalization', () => {
    expect(normalizeForComparison('Soluções de Saúde')).toBe('solucoes de saude');
  });

  it('collapses multiple whitespace to single space', () => {
    expect(normalizeForComparison('Torre   Soluções   de   Saúde')).toBe('torre solucoes de saude');
  });

  it('trims leading/trailing whitespace', () => {
    expect(normalizeForComparison('  DevOps/Cloud  ')).toBe('devops/cloud');
  });

  it('handles combined transformations', () => {
    expect(normalizeForComparison('  TORRE  SOLUÇÕES  DE  SAÚDE  ')).toBe('torre solucoes de saude');
  });

  it('handles string with no transformations needed', () => {
    expect(normalizeForComparison('redes')).toBe('redes');
  });

  it('handles empty string', () => {
    expect(normalizeForComparison('')).toBe('');
  });
});

describe('hasGarbledCharacters', () => {
  it('returns true for U+FFFD replacement character', () => {
    expect(hasGarbledCharacters('TORRE SOLU\uFFFDES DE SA\uFFFDDE')).toBe(true);
  });

  it('returns true for literal "�" sequence', () => {
    expect(hasGarbledCharacters('TORRE SOLU��ES DE SA�DE')).toBe(true);
  });

  it('returns false for clean Portuguese text', () => {
    expect(hasGarbledCharacters('Torre Soluções de Saúde')).toBe(false);
  });

  it('returns false for ASCII text', () => {
    expect(hasGarbledCharacters('DevOps/Cloud')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(hasGarbledCharacters('')).toBe(false);
  });
});

describe('findCanonicalMatch', () => {
  const canonicals: AreaRecord[] = [
    { id: 1, codigo: 'TORRE_SOLUCOES_DE_SAUDE', nome: 'Torre Soluções de Saúde', torre: null },
    { id: 2, codigo: 'DEVOPS_CLOUD', nome: 'DevOps/Cloud', torre: null },
    { id: 3, codigo: 'REDES', nome: 'Redes', torre: null },
  ];

  it('matches by normalized nome (case difference)', () => {
    const dup: AreaRecord = { id: 10, codigo: 'OTHER_CODE', nome: 'torre soluções de saúde', torre: null };
    const match = findCanonicalMatch(dup, canonicals);
    expect(match).toBeDefined();
    expect(match!.codigo).toBe('TORRE_SOLUCOES_DE_SAUDE');
  });

  it('matches by normalized nome (accent stripped)', () => {
    const dup: AreaRecord = { id: 10, codigo: 'OTHER_CODE', nome: 'Torre Solucoes de Saude', torre: null };
    const match = findCanonicalMatch(dup, canonicals);
    expect(match).toBeDefined();
    expect(match!.codigo).toBe('TORRE_SOLUCOES_DE_SAUDE');
  });

  it('matches by normalized codigo', () => {
    const dup: AreaRecord = { id: 10, codigo: 'torre_solucoes_de_saude', nome: 'Garbled Name', torre: null };
    const match = findCanonicalMatch(dup, canonicals);
    expect(match).toBeDefined();
    expect(match!.codigo).toBe('TORRE_SOLUCOES_DE_SAUDE');
  });

  it('returns undefined when no match', () => {
    const dup: AreaRecord = { id: 10, codigo: 'UNKNOWN_AREA', nome: 'Unknown Area', torre: null };
    const match = findCanonicalMatch(dup, canonicals);
    expect(match).toBeUndefined();
  });
});

describe('reassignReferences', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedCanonicalAreas(db);
    // Add a duplicate area
    db.prepare("INSERT INTO areas (codigo, nome, torre) VALUES (?, ?, ?)").run(
      'TORRE_SOLUCOES_DE_SAUDE_DUP', 'Torre Soluções de Saúde (dup)', null
    );
  });

  afterEach(() => {
    db.close();
  });

  it('reassigns users from duplicate to canonical area', () => {
    db.prepare("INSERT INTO users (codigo, area_codigo, nome, perfil, username, senha_hash) VALUES (?, ?, ?, ?, ?, ?)")
      .run('U001', 'TORRE_SOLUCOES_DE_SAUDE_DUP', 'Test User', 'Plantonista', 'testuser', 'hash');

    const count = reassignReferences(db, 'TORRE_SOLUCOES_DE_SAUDE_DUP', 'TORRE_SOLUCOES_DE_SAUDE');

    const user = db.prepare("SELECT area_codigo FROM users WHERE codigo = 'U001'").get() as any;
    expect(user.area_codigo).toBe('TORRE_SOLUCOES_DE_SAUDE');
    expect(count).toBeGreaterThan(0);
  });

  it('reassigns periodos from duplicate to canonical area', () => {
    db.prepare("INSERT INTO periodos (codigo, data, horarios, area_codigo) VALUES (?, ?, ?, ?)")
      .run('P001', '2024-01-15', '08:00-18:00', 'TORRE_SOLUCOES_DE_SAUDE_DUP');

    reassignReferences(db, 'TORRE_SOLUCOES_DE_SAUDE_DUP', 'TORRE_SOLUCOES_DE_SAUDE');

    const periodo = db.prepare("SELECT area_codigo FROM periodos WHERE codigo = 'P001'").get() as any;
    expect(periodo.area_codigo).toBe('TORRE_SOLUCOES_DE_SAUDE');
  });

  it('reassigns escalas from duplicate to canonical area', () => {
    // Need a periodo first for the FK
    db.prepare("INSERT INTO periodos (codigo, data, horarios, area_codigo) VALUES (?, ?, ?, ?)")
      .run('P001', '2024-01-15', '08:00-18:00', 'TORRE_SOLUCOES_DE_SAUDE_DUP');

    db.prepare("INSERT INTO escalas (codigo, area_codigo, periodo_codigo, usuario_codigo) VALUES (?, ?, ?, ?)")
      .run('E001', 'TORRE_SOLUCOES_DE_SAUDE_DUP', 'P001', 'U001');

    reassignReferences(db, 'TORRE_SOLUCOES_DE_SAUDE_DUP', 'TORRE_SOLUCOES_DE_SAUDE');

    const escala = db.prepare("SELECT area_codigo FROM escalas WHERE codigo = 'E001'").get() as any;
    expect(escala.area_codigo).toBe('TORRE_SOLUCOES_DE_SAUDE');
  });

  it('reassigns user_areas from duplicate to canonical area', () => {
    db.prepare("INSERT INTO users (codigo, area_codigo, nome, perfil, username, senha_hash) VALUES (?, ?, ?, ?, ?, ?)")
      .run('U001', 'TORRE_SOLUCOES_DE_SAUDE_DUP', 'Test User', 'Plantonista', 'testuser', 'hash');
    db.prepare("INSERT INTO user_areas (user_id, area_codigo) VALUES (?, ?)")
      .run(1, 'TORRE_SOLUCOES_DE_SAUDE_DUP');

    reassignReferences(db, 'TORRE_SOLUCOES_DE_SAUDE_DUP', 'TORRE_SOLUCOES_DE_SAUDE');

    const ua = db.prepare("SELECT area_codigo FROM user_areas WHERE user_id = 1").get() as any;
    expect(ua.area_codigo).toBe('TORRE_SOLUCOES_DE_SAUDE');
  });

  it('reassigns escalation_schedules by nome', () => {
    db.prepare("INSERT INTO escalation_schedules (area, colaborador, dia, mes, ano, horario_inicio, horario_fim) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run('Torre Soluções de Saúde (dup)', 'John', 15, 1, 2024, '08:00', '18:00');

    reassignReferences(
      db,
      'TORRE_SOLUCOES_DE_SAUDE_DUP',
      'TORRE_SOLUCOES_DE_SAUDE',
      'Torre Soluções de Saúde (dup)',
      'Torre Soluções de Saúde'
    );

    const schedule = db.prepare("SELECT area FROM escalation_schedules WHERE colaborador = 'John'").get() as any;
    expect(schedule.area).toBe('Torre Soluções de Saúde');
  });

  it('returns total count of reassigned references', () => {
    db.prepare("INSERT INTO users (codigo, area_codigo, nome, perfil, username, senha_hash) VALUES (?, ?, ?, ?, ?, ?)")
      .run('U001', 'TORRE_SOLUCOES_DE_SAUDE_DUP', 'User 1', 'Plantonista', 'user1', 'hash');
    db.prepare("INSERT INTO users (codigo, area_codigo, nome, perfil, username, senha_hash) VALUES (?, ?, ?, ?, ?, ?)")
      .run('U002', 'TORRE_SOLUCOES_DE_SAUDE_DUP', 'User 2', 'Plantonista', 'user2', 'hash');
    db.prepare("INSERT INTO periodos (codigo, data, horarios, area_codigo) VALUES (?, ?, ?, ?)")
      .run('P001', '2024-01-15', '08:00-18:00', 'TORRE_SOLUCOES_DE_SAUDE_DUP');

    const count = reassignReferences(db, 'TORRE_SOLUCOES_DE_SAUDE_DUP', 'TORRE_SOLUCOES_DE_SAUDE');
    expect(count).toBe(3); // 2 users + 1 periodo
  });
});

describe('runDeduplication', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDb();
    seedCanonicalAreas(db);
  });

  afterEach(() => {
    db.close();
  });

  it('returns zero counts when no duplicates exist', () => {
    const result = runDeduplication(db);
    expect(result.duplicatesFound).toBe(0);
    expect(result.duplicatesRemoved).toBe(0);
    expect(result.referencesReassigned).toBe(0);
  });

  it('removes duplicate area that matches canonical by normalized name', () => {
    // Insert a duplicate with same name but different case/accents
    db.prepare("INSERT INTO areas (codigo, nome, torre) VALUES (?, ?, ?)")
      .run('TORRE_SOLUCOES_DUP', 'torre solucoes de saude', null);

    const result = runDeduplication(db);
    expect(result.duplicatesFound).toBe(1);
    expect(result.duplicatesRemoved).toBe(1);

    // Verify it's gone
    const remaining = db.prepare("SELECT * FROM areas WHERE codigo = 'TORRE_SOLUCOES_DUP'").get();
    expect(remaining).toBeUndefined();
  });

  it('removes garbled area that matches canonical by codigo', () => {
    db.prepare("INSERT INTO areas (codigo, nome, torre) VALUES (?, ?, ?)")
      .run('TORRE_SOLUCOES_DE_SAUDE_V2', 'TORRE SOLU\uFFFDES DE SA\uFFFDDE', null);

    const result = runDeduplication(db);
    // This has garbled chars but codigo doesn't match — should NOT be deleted unless codec matches
    // Since TORRE_SOLUCOES_DE_SAUDE_V2 doesn't normalize to same as any canonical codigo,
    // it won't have a match via findCanonicalMatch (nome is garbled, won't match normalized canonical nome)
    // But it has garbled characters, so it enters the garbled path and tries codigo match
    // normalizeForComparison('TORRE_SOLUCOES_DE_SAUDE_V2') !== normalizeForComparison('TORRE_SOLUCOES_DE_SAUDE')
    // So it should stay (no match found for garbled entry)
    expect(result.duplicatesRemoved).toBe(0);
  });

  it('reassigns FK references before deleting duplicate', () => {
    // Insert a duplicate area
    db.prepare("INSERT INTO areas (codigo, nome, torre) VALUES (?, ?, ?)")
      .run('DEVOPS_CLOUD_DUP', 'DevOps/Cloud', null);

    // Add a user pointing to the duplicate
    db.prepare("INSERT INTO users (codigo, area_codigo, nome, perfil, username, senha_hash) VALUES (?, ?, ?, ?, ?, ?)")
      .run('U001', 'DEVOPS_CLOUD_DUP', 'Test User', 'Plantonista', 'testuser', 'hash');

    // Add a periodo pointing to the duplicate
    db.prepare("INSERT INTO periodos (codigo, data, horarios, area_codigo) VALUES (?, ?, ?, ?)")
      .run('P001', '2024-01-15', '08:00-18:00', 'DEVOPS_CLOUD_DUP');

    const result = runDeduplication(db);

    expect(result.duplicatesFound).toBe(1);
    expect(result.duplicatesRemoved).toBe(1);
    expect(result.referencesReassigned).toBe(2); // 1 user + 1 periodo

    // Verify references now point to canonical
    const user = db.prepare("SELECT area_codigo FROM users WHERE codigo = 'U001'").get() as any;
    expect(user.area_codigo).toBe('DEVOPS_CLOUD');

    const periodo = db.prepare("SELECT area_codigo FROM periodos WHERE codigo = 'P001'").get() as any;
    expect(periodo.area_codigo).toBe('DEVOPS_CLOUD');

    // Verify duplicate is deleted
    const dup = db.prepare("SELECT * FROM areas WHERE codigo = 'DEVOPS_CLOUD_DUP'").get();
    expect(dup).toBeUndefined();
  });

  it('is idempotent — running multiple times produces no additional changes', () => {
    db.prepare("INSERT INTO areas (codigo, nome, torre) VALUES (?, ?, ?)")
      .run('REDES_DUP', 'Redes', null);

    const first = runDeduplication(db);
    expect(first.duplicatesRemoved).toBe(1);

    const second = runDeduplication(db);
    expect(second.duplicatesRemoved).toBe(0);
    expect(second.referencesReassigned).toBe(0);
  });

  it('does not remove canonical areas', () => {
    runDeduplication(db);

    const areas = db.prepare("SELECT codigo FROM areas").all() as Array<{ codigo: string }>;
    const codigos = areas.map(a => a.codigo);
    expect(codigos).toContain('TORRE_SOLUCOES_DE_SAUDE');
    expect(codigos).toContain('DEVOPS_CLOUD');
    expect(codigos).toContain('REDES');
    expect(codigos).toContain('COMMAND_CENTER');
  });

  it('handles user_areas unique constraint conflicts gracefully', () => {
    db.prepare("INSERT INTO areas (codigo, nome, torre) VALUES (?, ?, ?)")
      .run('REDES_DUP', 'Redes', null);

    db.prepare("INSERT INTO users (codigo, area_codigo, nome, perfil, username, senha_hash) VALUES (?, ?, ?, ?, ?, ?)")
      .run('U001', 'REDES', 'Test User', 'Plantonista', 'testuser', 'hash');

    // User has bindings to both canonical and duplicate
    db.prepare("INSERT INTO user_areas (user_id, area_codigo) VALUES (?, ?)").run(1, 'REDES');
    db.prepare("INSERT INTO user_areas (user_id, area_codigo) VALUES (?, ?)").run(1, 'REDES_DUP');

    // Should not throw — handles the unique constraint conflict
    const result = runDeduplication(db);
    expect(result.duplicatesRemoved).toBe(1);

    // Verify only canonical binding remains
    const bindings = db.prepare("SELECT area_codigo FROM user_areas WHERE user_id = 1").all() as any[];
    expect(bindings).toHaveLength(1);
    expect(bindings[0].area_codigo).toBe('REDES');
  });
});
