import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase, TEAMS_SEED, normalizeForComparison, deduplicateAreas } from './init';

describe('Database Initialization', () => {
  let db: Database.Database;

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('should create database with in-memory path', () => {
    db = initializeDatabase(':memory:');
    expect(db.open).toBe(true);
  });

  it('should enable WAL journal mode (in-memory returns memory)', () => {
    db = initializeDatabase(':memory:');
    // In-memory databases always use 'memory' journal mode.
    // WAL mode is correctly set for file-based databases.
    const result = db.pragma('journal_mode', { simple: true });
    expect(result).toBe('memory');
  });

  it('should set WAL mode for file-based databases', () => {
    const fs = require('fs');
    const path = require('path');
    const tmpDir = path.join(__dirname, '../../../.tmp-test');
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    const dbPath = path.join(tmpDir, 'test-wal.db');

    try {
      db = initializeDatabase(dbPath);
      const result = db.pragma('journal_mode', { simple: true });
      expect(result).toBe('wal');
      db.close();
    } finally {
      // Clean up test files
      if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
      if (fs.existsSync(dbPath + '-wal')) fs.unlinkSync(dbPath + '-wal');
      if (fs.existsSync(dbPath + '-shm')) fs.unlinkSync(dbPath + '-shm');
      if (fs.existsSync(tmpDir)) fs.rmdirSync(tmpDir);
    }
  });

  it('should enable foreign keys', () => {
    db = initializeDatabase(':memory:');
    const result = db.pragma('foreign_keys', { simple: true });
    expect(result).toBe(1);
  });

  describe('Table creation', () => {
    it('should create all 12 tables', () => {
      db = initializeDatabase(':memory:');
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
        .all() as { name: string }[];

      const tableNames = tables.map((t) => t.name);
      expect(tableNames).toContain('teams');
      expect(tableNames).toContain('monitor_team_mapping');
      expect(tableNames).toContain('schedules');
      expect(tableNames).toContain('escalation_chains');
      expect(tableNames).toContain('incidents');
      expect(tableNames).toContain('escalation_events');
      expect(tableNames).toContain('areas');
      expect(tableNames).toContain('users');
      expect(tableNames).toContain('periodos');
      expect(tableNames).toContain('escalas');
      expect(tableNames).toContain('area_escalation_chains');
      expect(tableNames).toContain('monitor_area_mapping');
    });

    it('should be idempotent (calling twice does not error)', () => {
      db = initializeDatabase(':memory:');
      // Call initialization logic again on the same db - should not throw
      expect(() => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS teams (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            display_order INTEGER NOT NULL
          );
        `);
      }).not.toThrow();
    });
  });

  describe('Teams seed', () => {
    it('should seed exactly 11 teams', () => {
      db = initializeDatabase(':memory:');
      const teams = db.prepare('SELECT * FROM teams ORDER BY display_order').all() as {
        id: string;
        name: string;
        display_order: number;
      }[];

      expect(teams).toHaveLength(11);
    });

    it('should have display_order from 1 to 11', () => {
      db = initializeDatabase(':memory:');
      const teams = db.prepare('SELECT display_order FROM teams ORDER BY display_order').all() as {
        display_order: number;
      }[];

      const orders = teams.map((t) => t.display_order);
      expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    });

    it('should match TEAMS_SEED data', () => {
      db = initializeDatabase(':memory:');
      const teams = db.prepare('SELECT id, name, display_order FROM teams ORDER BY display_order').all() as {
        id: string;
        name: string;
        display_order: number;
      }[];

      for (let i = 0; i < TEAMS_SEED.length; i++) {
        expect(teams[i].id).toBe(TEAMS_SEED[i].id);
        expect(teams[i].name).toBe(TEAMS_SEED[i].name);
        expect(teams[i].display_order).toBe(TEAMS_SEED[i].displayOrder);
      }
    });

    it('should not duplicate teams on second initialization', () => {
      db = initializeDatabase(':memory:');
      // Simulate second initialization by re-running seed
      const insert = db.prepare(
        'INSERT OR IGNORE INTO teams (id, name, display_order) VALUES (?, ?, ?)'
      );
      for (const team of TEAMS_SEED) {
        insert.run(team.id, team.name, team.displayOrder);
      }

      const count = db.prepare('SELECT COUNT(*) as count FROM teams').get() as { count: number };
      expect(count.count).toBe(11);
    });
  });

  describe('Table schemas', () => {
    it('should create monitor_team_mapping with correct columns', () => {
      db = initializeDatabase(':memory:');
      const columns = db.prepare("PRAGMA table_info('monitor_team_mapping')").all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];

      const colNames = columns.map((c) => c.name);
      expect(colNames).toContain('monitor_id');
      expect(colNames).toContain('team_id');
      expect(colNames).toContain('monitor_name');
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');

      const pk = columns.find((c) => c.name === 'monitor_id');
      expect(pk?.pk).toBe(1);
    });

    it('should create schedules with UNIQUE constraint on team_id, date, start_time', () => {
      db = initializeDatabase(':memory:');

      // Insert a schedule entry
      db.prepare(
        "INSERT INTO schedules (team_id, person_name, date, start_time, end_time) VALUES ('team-alpha', 'Person A', '2024-01-01', '08:00', '16:00')"
      ).run();

      // Duplicate should fail
      expect(() => {
        db.prepare(
          "INSERT INTO schedules (team_id, person_name, date, start_time, end_time) VALUES ('team-alpha', 'Person B', '2024-01-01', '08:00', '20:00')"
        ).run();
      }).toThrow();
    });

    it('should create escalation_chains with UNIQUE constraint on team_id, position', () => {
      db = initializeDatabase(':memory:');

      db.prepare(
        "INSERT INTO escalation_chains (team_id, person_name, position) VALUES ('team-alpha', 'Person A', 1)"
      ).run();

      expect(() => {
        db.prepare(
          "INSERT INTO escalation_chains (team_id, person_name, position) VALUES ('team-alpha', 'Person B', 1)"
        ).run();
      }).toThrow();
    });

    it('should create incidents with default status active', () => {
      db = initializeDatabase(':memory:');

      db.prepare(
        "INSERT INTO incidents (id, monitor_id, monitor_name, team_id, on_call_person) VALUES ('inc-1', 123, 'Test Monitor', 'team-alpha', 'Person A')"
      ).run();

      const incident = db.prepare('SELECT status FROM incidents WHERE id = ?').get('inc-1') as {
        status: string;
      };
      expect(incident.status).toBe('active');
    });

    it('should create escalation_events with autoincrement id', () => {
      db = initializeDatabase(':memory:');

      // Need an incident first (for foreign key)
      db.prepare(
        "INSERT INTO incidents (id, monitor_id, monitor_name, team_id, on_call_person) VALUES ('inc-1', 123, 'Test Monitor', 'team-alpha', 'Person A')"
      ).run();

      db.prepare(
        "INSERT INTO escalation_events (incident_id, from_person, to_person, escalation_level) VALUES ('inc-1', 'Person A', 'Person B', 1)"
      ).run();

      const event = db.prepare('SELECT id FROM escalation_events WHERE incident_id = ?').get('inc-1') as {
        id: number;
      };
      expect(event.id).toBe(1);
    });

    it('should create areas table with correct columns and UNIQUE codigo', () => {
      db = initializeDatabase(':memory:');
      const columns = db.prepare("PRAGMA table_info('areas')").all() as {
        name: string;
        type: string;
        notnull: number;
        pk: number;
      }[];

      const colNames = columns.map((c) => c.name);
      expect(colNames).toContain('id');
      expect(colNames).toContain('codigo');
      expect(colNames).toContain('nome');
      expect(colNames).toContain('torre');
      expect(colNames).toContain('created_at');
      expect(colNames).toContain('updated_at');

      // Insert area
      db.prepare(
        "INSERT INTO areas (codigo, nome, torre) VALUES ('AREA-001', 'Infraestrutura', 'Torre A')"
      ).run();

      // Duplicate codigo should fail
      expect(() => {
        db.prepare(
          "INSERT INTO areas (codigo, nome, torre) VALUES ('AREA-001', 'Outra Area', 'Torre B')"
        ).run();
      }).toThrow();
    });

    it('should create users table with perfil CHECK constraint', () => {
      db = initializeDatabase(':memory:');

      // First insert an area for the foreign key
      db.prepare(
        "INSERT INTO areas (codigo, nome, torre) VALUES ('AREA-001', 'Infra', 'Torre A')"
      ).run();

      // Valid perfil
      db.prepare(
        "INSERT INTO users (codigo, area_codigo, nome, perfil, cargo, username, senha_hash) VALUES ('USR-001', 'AREA-001', 'João Silva', 'Adm', 'Gerente', 'joao', 'hash123')"
      ).run();

      const user = db.prepare('SELECT * FROM users WHERE codigo = ?').get('USR-001') as {
        perfil: string;
        nome: string;
      };
      expect(user.perfil).toBe('Adm');
      expect(user.nome).toBe('João Silva');

      // Invalid perfil should fail
      expect(() => {
        db.prepare(
          "INSERT INTO users (codigo, area_codigo, nome, perfil, cargo, username, senha_hash) VALUES ('USR-002', 'AREA-001', 'Maria', 'InvalidPerfil', 'Analista', 'maria', 'hash456')"
        ).run();
      }).toThrow();
    });

    it('should create users with UNIQUE username constraint', () => {
      db = initializeDatabase(':memory:');

      db.prepare(
        "INSERT INTO areas (codigo, nome, torre) VALUES ('AREA-001', 'Infra', 'Torre A')"
      ).run();

      db.prepare(
        "INSERT INTO users (codigo, area_codigo, nome, perfil, cargo, username, senha_hash) VALUES ('USR-001', 'AREA-001', 'João', 'Plantonista', 'Analista', 'joao', 'hash1')"
      ).run();

      // Duplicate username should fail
      expect(() => {
        db.prepare(
          "INSERT INTO users (codigo, area_codigo, nome, perfil, cargo, username, senha_hash) VALUES ('USR-002', 'AREA-001', 'Maria', 'Plantonista', 'Analista', 'joao', 'hash2')"
        ).run();
      }).toThrow();
    });

    it('should create periodos table with foreign key to areas', () => {
      db = initializeDatabase(':memory:');

      db.prepare(
        "INSERT INTO areas (codigo, nome, torre) VALUES ('AREA-001', 'Infra', 'Torre A')"
      ).run();

      db.prepare(
        "INSERT INTO periodos (codigo, data, horarios, area_codigo) VALUES ('PER-001', '2024-06-01', '08:00-16:00', 'AREA-001')"
      ).run();

      const periodo = db.prepare('SELECT * FROM periodos WHERE codigo = ?').get('PER-001') as {
        codigo: string;
        data: string;
        horarios: string;
        area_codigo: string;
      };
      expect(periodo.data).toBe('2024-06-01');
      expect(periodo.horarios).toBe('08:00-16:00');
      expect(periodo.area_codigo).toBe('AREA-001');

      // Foreign key violation should fail
      expect(() => {
        db.prepare(
          "INSERT INTO periodos (codigo, data, horarios, area_codigo) VALUES ('PER-002', '2024-06-02', '16:00-00:00', 'INVALID-AREA')"
        ).run();
      }).toThrow();
    });

    it('should create escalas table with foreign keys to areas, periodos, and users', () => {
      db = initializeDatabase(':memory:');

      // Setup dependencies
      db.prepare(
        "INSERT INTO areas (codigo, nome, torre) VALUES ('AREA-001', 'Infra', 'Torre A')"
      ).run();
      db.prepare(
        "INSERT INTO periodos (codigo, data, horarios, area_codigo) VALUES ('PER-001', '2024-06-01', '08:00-16:00', 'AREA-001')"
      ).run();
      db.prepare(
        "INSERT INTO users (codigo, area_codigo, nome, perfil, cargo, username, senha_hash) VALUES ('USR-001', 'AREA-001', 'João', 'Plantonista', 'Analista', 'joao', 'hash1')"
      ).run();

      // Insert valid escala
      db.prepare(
        "INSERT INTO escalas (codigo, area_codigo, periodo_codigo, usuario_codigo) VALUES ('ESC-001', 'AREA-001', 'PER-001', 'USR-001')"
      ).run();

      const escala = db.prepare('SELECT * FROM escalas WHERE codigo = ?').get('ESC-001') as {
        codigo: string;
        area_codigo: string;
        periodo_codigo: string;
        usuario_codigo: string;
      };
      expect(escala.area_codigo).toBe('AREA-001');
      expect(escala.periodo_codigo).toBe('PER-001');
      expect(escala.usuario_codigo).toBe('USR-001');

      // Foreign key violation (invalid area) should fail
      expect(() => {
        db.prepare(
          "INSERT INTO escalas (codigo, area_codigo, periodo_codigo, usuario_codigo) VALUES ('ESC-002', 'INVALID', 'PER-001', 'USR-001')"
        ).run();
      }).toThrow();

      // Foreign key violation (invalid periodo) should fail
      expect(() => {
        db.prepare(
          "INSERT INTO escalas (codigo, area_codigo, periodo_codigo, usuario_codigo) VALUES ('ESC-003', 'AREA-001', 'INVALID', 'USR-001')"
        ).run();
      }).toThrow();

      // Foreign key violation (invalid usuario) should fail
      expect(() => {
        db.prepare(
          "INSERT INTO escalas (codigo, area_codigo, periodo_codigo, usuario_codigo) VALUES ('ESC-004', 'AREA-001', 'PER-001', 'INVALID')"
        ).run();
      }).toThrow();
    });
  });
});

describe('Area Deduplication', () => {
  let db: Database.Database;

  afterEach(() => {
    if (db && db.open) {
      db.close();
    }
  });

  it('should remove duplicate areas with garbled encoding after initialization', () => {
    db = initializeDatabase(':memory:');

    // Insert garbled duplicates (simulating CSV-imported entries with broken chars)
    db.prepare(
      "INSERT INTO areas (codigo, nome, torre) VALUES ('TORRE_SOLUCOES_DE_SAUDE_DUP', 'TORRE SOLU◆◆ES DE SA◆DE', null)"
    ).run();
    db.prepare(
      "INSERT INTO areas (codigo, nome, torre) VALUES ('SEGURANCA_DA_INFORMACAO_DUP', 'SEGURAN◆A DA INFORMA◆◆O', null)"
    ).run();

    // Run deduplication
    deduplicateAreas(db);

    // Garbled duplicates should be removed
    const areas = db.prepare('SELECT codigo FROM areas').all() as { codigo: string }[];
    const codigos = areas.map((a) => a.codigo);
    expect(codigos).not.toContain('TORRE_SOLUCOES_DE_SAUDE_DUP');
    expect(codigos).not.toContain('SEGURANCA_DA_INFORMACAO_DUP');
  });

  it('should keep canonical AREAS_SEED entries intact', () => {
    db = initializeDatabase(':memory:');

    // Insert a garbled duplicate
    db.prepare(
      "INSERT INTO areas (codigo, nome, torre) VALUES ('DEVOPS_CLOUD_DUP', 'DEVOPS CLOUD', null)"
    ).run();

    deduplicateAreas(db);

    // Canonical entry should still exist
    const canonical = db.prepare("SELECT * FROM areas WHERE codigo = 'DEVOPS_CLOUD'").get() as {
      codigo: string;
      nome: string;
    } | undefined;
    expect(canonical).toBeDefined();
    expect(canonical!.nome).toBe('DevOps/Cloud');
  });

  it('should not delete areas that do not match any canonical entry', () => {
    db = initializeDatabase(':memory:');

    // Insert a completely new area that doesn't match any canonical entry
    db.prepare(
      "INSERT INTO areas (codigo, nome, torre) VALUES ('NOVA_AREA', 'Uma Nova Área Qualquer', null)"
    ).run();

    deduplicateAreas(db);

    const newArea = db.prepare("SELECT * FROM areas WHERE codigo = 'NOVA_AREA'").get();
    expect(newArea).toBeDefined();
  });

  it('should handle case-insensitive matching for duplicates', () => {
    db = initializeDatabase(':memory:');

    // Insert an uppercase variant without special chars (simulating garbled encoding)
    db.prepare(
      "INSERT INTO areas (codigo, nome, torre) VALUES ('CMD_CENTER_DUP', 'command center', null)"
    ).run();

    deduplicateAreas(db);

    // The uppercase/lowercase duplicate should be removed
    const dup = db.prepare("SELECT * FROM areas WHERE codigo = 'CMD_CENTER_DUP'").get();
    expect(dup).toBeUndefined();
  });

  it('should be idempotent (running twice does not error or change results)', () => {
    db = initializeDatabase(':memory:');

    // Insert a duplicate
    db.prepare(
      "INSERT INTO areas (codigo, nome, torre) VALUES ('REDES_DUP', 'Redes', null)"
    ).run();

    deduplicateAreas(db);
    deduplicateAreas(db); // second call should be safe

    const count = db.prepare('SELECT COUNT(*) as count FROM areas').get() as { count: number };
    // Should have exactly 14 canonical areas
    expect(count.count).toBe(14);
  });
});

describe('normalizeForComparison', () => {
  it('should lowercase, strip accents, and remove non-alphanumeric', () => {
    expect(normalizeForComparison('Torre Soluções de Saúde')).toBe('torresolucoesdesaude');
  });

  it('should remove all non-alphanumeric characters including spaces and slashes', () => {
    expect(normalizeForComparison('DevOps/Cloud')).toBe('devopscloud');
  });

  it('should remove special characters like ◆', () => {
    expect(normalizeForComparison('TORRE SOLU◆◆ES DE SA◆DE')).toBe('torresoluesdesade');
  });

  it('should normalize accented Portuguese characters', () => {
    expect(normalizeForComparison('Segurança da Informação')).toBe('segurancadainformacao');
  });

  it('should be case insensitive', () => {
    expect(normalizeForComparison('Redes')).toBe(normalizeForComparison('REDES'));
    expect(normalizeForComparison('Redes')).toBe(normalizeForComparison('redes'));
  });

  it('should produce the same result for properly-encoded and uppercase canonical names', () => {
    expect(normalizeForComparison('Torre Soluções de Saúde')).toBe(
      normalizeForComparison('TORRE SOLUÇÕES DE SAÚDE')
    );
  });
});
