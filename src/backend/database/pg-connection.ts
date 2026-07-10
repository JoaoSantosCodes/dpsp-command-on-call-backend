/**
 * PostgreSQL connection module.
 * Used in production when DATABASE_URL is set.
 * Provides a wrapper that mimics better-sqlite3 sync API using a connection pool.
 */
import { Pool, PoolClient } from 'pg';

let pool: Pool | null = null;

export function createPgPool(connectionString: string): Pool {
  pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
  });

  pool.on('error', (err) => {
    console.error('[PostgreSQL] Pool error:', err.message);
  });

  return pool;
}

export function getPool(): Pool {
  if (!pool) throw new Error('PostgreSQL pool not initialized');
  return pool;
}

/**
 * SQLite-compatible wrapper for PostgreSQL.
 * Provides .prepare().run/get/all methods that work synchronously-ish
 * by using the pool directly. For the migration, we use async versions.
 */
export class PgDatabase {
  private pool: Pool;

  constructor(connectionString: string) {
    this.pool = createPgPool(connectionString);
  }

  async query(sql: string, params: any[] = []): Promise<any[]> {
    const result = await this.pool.query(sql, params);
    return result.rows;
  }

  async queryOne(sql: string, params: any[] = []): Promise<any | null> {
    const result = await this.pool.query(sql, params);
    return result.rows[0] || null;
  }

  async execute(sql: string, params: any[] = []): Promise<{ rowCount: number; lastId?: number }> {
    const result = await this.pool.query(sql + ' RETURNING id', params);
    return { rowCount: result.rowCount || 0, lastId: result.rows[0]?.id };
  }

  async exec(sql: string): Promise<void> {
    await this.pool.query(sql);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  // Pragma is SQLite-specific, no-op for PostgreSQL
  pragma(_value: string): any {
    return null;
  }
}

/**
 * Initialize PostgreSQL schema (create tables if not exist).
 */
export async function initializePostgresSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
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

      CREATE TABLE IF NOT EXISTS areas (
        id SERIAL PRIMARY KEY,
        codigo TEXT NOT NULL UNIQUE,
        nome TEXT NOT NULL,
        torre TEXT,
        coordenador_nome TEXT,
        coordenador_contato TEXT,
        gerente_nome TEXT,
        gerente_contato TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        codigo TEXT NOT NULL UNIQUE,
        area_codigo TEXT REFERENCES areas(codigo),
        area_solicitada TEXT,
        nome TEXT NOT NULL,
        perfil TEXT NOT NULL CHECK(perfil IN ('Adm', 'Responsavel', 'Plantonista', 'Consultor')),
        nivel_escalonamento TEXT,
        cargo TEXT,
        contato TEXT,
        username TEXT NOT NULL UNIQUE,
        senha_hash TEXT NOT NULL,
        ativo BOOLEAN NOT NULL DEFAULT true,
        aprovado BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS periodos (
        id SERIAL PRIMARY KEY,
        codigo TEXT NOT NULL UNIQUE,
        data TEXT NOT NULL,
        horarios TEXT NOT NULL,
        area_codigo TEXT NOT NULL REFERENCES areas(codigo),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS escalas (
        id SERIAL PRIMARY KEY,
        codigo TEXT NOT NULL UNIQUE,
        area_codigo TEXT NOT NULL REFERENCES areas(codigo),
        periodo_codigo TEXT NOT NULL REFERENCES periodos(codigo),
        usuario_codigo TEXT NOT NULL REFERENCES users(codigo),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
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
        is_24h BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW()
      );

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
        UNIQUE(problema_id, area_codigo)
      );

      CREATE TABLE IF NOT EXISTS monitors (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        state TEXT DEFAULT 'OK',
        tags TEXT,
        priority TEXT DEFAULT 'P1',
        area_codigo TEXT,
        last_updated TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS user_areas (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        area_codigo TEXT NOT NULL REFERENCES areas(codigo),
        created_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, area_codigo)
      );

      CREATE TABLE IF NOT EXISTS user_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        menu TEXT NOT NULL,
        can_read BOOLEAN NOT NULL DEFAULT true,
        can_edit BOOLEAN NOT NULL DEFAULT false,
        can_delete BOOLEAN NOT NULL DEFAULT false,
        UNIQUE(user_id, menu)
      );

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

      CREATE TABLE IF NOT EXISTS schedules (
        id SERIAL PRIMARY KEY,
        team_id TEXT NOT NULL,
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
        team_id TEXT NOT NULL,
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
        started_at TIMESTAMP DEFAULT NOW(),
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
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS area_escalation_chains (
        id SERIAL PRIMARY KEY,
        area_codigo TEXT NOT NULL REFERENCES areas(codigo),
        person_name TEXT NOT NULL,
        person_contact TEXT,
        position INTEGER NOT NULL,
        UNIQUE(area_codigo, position)
      );

      CREATE TABLE IF NOT EXISTS monitor_area_mapping (
        monitor_id INTEGER PRIMARY KEY,
        area_codigo TEXT NOT NULL REFERENCES areas(codigo),
        monitor_name TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      -- Indexes
      CREATE INDEX IF NOT EXISTS idx_escalation_area_dia ON escalation_schedules(area, ano, mes, dia);
      CREATE INDEX IF NOT EXISTS idx_users_area ON users(area_codigo);
      CREATE INDEX IF NOT EXISTS idx_escalas_area ON escalas(area_codigo);
      CREATE INDEX IF NOT EXISTS idx_periodos_area_data ON periodos(area_codigo, data);
      CREATE INDEX IF NOT EXISTS idx_problema_areas_problema ON problema_areas(problema_id);
    `);

    console.log('[PostgreSQL] Schema initialized');
  } finally {
    client.release();
  }
}
