import Database from 'better-sqlite3';
import { Escala } from '../../../shared/types';

export class EscalaRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(escala: Omit<Escala, 'id' | 'createdAt' | 'updatedAt'>): Escala {
    const stmt = this.db.prepare(`
      INSERT INTO escalas (codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(
      escala.codigo,
      escala.areaCodigo,
      escala.periodoCodigo,
      escala.usuarioCodigo
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): Escala | undefined {
    const stmt = this.db.prepare(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas WHERE id = ?
    `);
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  getByCodigo(codigo: string): Escala | undefined {
    const stmt = this.db.prepare(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas WHERE codigo = ?
    `);
    const row = stmt.get(codigo) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  getByArea(areaCodigo: string): Escala[] {
    const stmt = this.db.prepare(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas WHERE area_codigo = ?
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(areaCodigo) as any[];
    return rows.map(this.mapRow);
  }

  getByPeriodo(periodoCodigo: string): Escala[] {
    const stmt = this.db.prepare(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas WHERE periodo_codigo = ?
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(periodoCodigo) as any[];
    return rows.map(this.mapRow);
  }

  getByUsuario(usuarioCodigo: string): Escala[] {
    const stmt = this.db.prepare(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas WHERE usuario_codigo = ?
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(usuarioCodigo) as any[];
    return rows.map(this.mapRow);
  }

  getAll(): Escala[] {
    const stmt = this.db.prepare(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas ORDER BY created_at ASC
    `);
    const rows = stmt.all() as any[];
    return rows.map(this.mapRow);
  }

  update(id: number, data: Partial<Omit<Escala, 'id' | 'createdAt' | 'updatedAt'>>): Escala | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.codigo !== undefined) { fields.push('codigo = ?'); values.push(data.codigo); }
    if (data.areaCodigo !== undefined) { fields.push('area_codigo = ?'); values.push(data.areaCodigo); }
    if (data.periodoCodigo !== undefined) { fields.push('periodo_codigo = ?'); values.push(data.periodoCodigo); }
    if (data.usuarioCodigo !== undefined) { fields.push('usuario_codigo = ?'); values.push(data.usuarioCodigo); }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = this.db.prepare(`UPDATE escalas SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.getById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM escalas WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private mapRow(row: any): Escala {
    return {
      id: row.id,
      codigo: row.codigo,
      areaCodigo: row.area_codigo,
      periodoCodigo: row.periodo_codigo,
      usuarioCodigo: row.usuario_codigo,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
