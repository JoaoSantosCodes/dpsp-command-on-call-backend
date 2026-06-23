import Database from 'better-sqlite3';
import { Area } from '../../../shared/types';

export class AreaRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(area: Omit<Area, 'id' | 'createdAt' | 'updatedAt'>): Area {
    const stmt = this.db.prepare(`
      INSERT INTO areas (codigo, nome, torre, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(area.codigo, area.nome, area.torre || null);
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): Area | undefined {
    const stmt = this.db.prepare(`
      SELECT id, codigo, nome, torre, created_at, updated_at
      FROM areas WHERE id = ?
    `);
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  getByCodigo(codigo: string): Area | undefined {
    const stmt = this.db.prepare(`
      SELECT id, codigo, nome, torre, created_at, updated_at
      FROM areas WHERE codigo = ?
    `);
    const row = stmt.get(codigo) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  getAll(): Area[] {
    const stmt = this.db.prepare(`
      SELECT id, codigo, nome, torre, created_at, updated_at
      FROM areas ORDER BY nome ASC
    `);
    const rows = stmt.all() as any[];
    return rows.map(this.mapRow);
  }

  update(id: number, data: Partial<Omit<Area, 'id' | 'createdAt' | 'updatedAt'>>): Area | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.codigo !== undefined) { fields.push('codigo = ?'); values.push(data.codigo); }
    if (data.nome !== undefined) { fields.push('nome = ?'); values.push(data.nome); }
    if (data.torre !== undefined) { fields.push('torre = ?'); values.push(data.torre || null); }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = this.db.prepare(`UPDATE areas SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.getById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM areas WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private mapRow(row: any): Area {
    return {
      id: row.id,
      codigo: row.codigo,
      nome: row.nome,
      torre: row.torre || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
