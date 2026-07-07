import Database from 'better-sqlite3';

export interface Problema {
  id: number;
  codigo: string;
  descricao: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProblemaArea {
  id: number;
  problemaId: number;
  areaCodigo: string;
  ordem: number;
  createdAt: string;
}

export interface ProblemaWithAreas extends Problema {
  areas: ProblemaArea[];
}

export class ProblemaRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(data: { codigo: string; descricao: string }): Problema {
    const stmt = this.db.prepare(`
      INSERT INTO problemas (codigo, descricao, created_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(data.codigo, data.descricao);
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): Problema | undefined {
    const stmt = this.db.prepare(`
      SELECT id, codigo, descricao, created_at, updated_at
      FROM problemas WHERE id = ?
    `);
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  getByCodigo(codigo: string): Problema | undefined {
    const stmt = this.db.prepare(`
      SELECT id, codigo, descricao, created_at, updated_at
      FROM problemas WHERE codigo = ?
    `);
    const row = stmt.get(codigo) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  getAll(): Problema[] {
    const stmt = this.db.prepare(`
      SELECT id, codigo, descricao, created_at, updated_at
      FROM problemas ORDER BY codigo ASC
    `);
    const rows = stmt.all() as any[];
    return rows.map(this.mapRow);
  }

  getAllWithAreas(): ProblemaWithAreas[] {
    const problemas = this.getAll();
    return problemas.map((p) => ({
      ...p,
      areas: this.getAreas(p.id),
    }));
  }

  update(id: number, data: { codigo?: string; descricao?: string }): Problema | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.codigo !== undefined) { fields.push('codigo = ?'); values.push(data.codigo); }
    if (data.descricao !== undefined) { fields.push('descricao = ?'); values.push(data.descricao); }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = this.db.prepare(`UPDATE problemas SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.getById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM problemas WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  // === Problema Areas (grid) ===

  getAreas(problemaId: number): ProblemaArea[] {
    const stmt = this.db.prepare(`
      SELECT id, problema_id, area_codigo, ordem, created_at
      FROM problema_areas WHERE problema_id = ?
      ORDER BY ordem ASC
    `);
    const rows = stmt.all(problemaId) as any[];
    return rows.map(this.mapAreaRow);
  }

  addArea(problemaId: number, areaCodigo: string, ordem: number): ProblemaArea {
    const stmt = this.db.prepare(`
      INSERT INTO problema_areas (problema_id, area_codigo, ordem, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);
    const result = stmt.run(problemaId, areaCodigo, ordem);
    return {
      id: Number(result.lastInsertRowid),
      problemaId,
      areaCodigo,
      ordem,
      createdAt: new Date().toISOString(),
    };
  }

  removeArea(problemaId: number, areaCodigo: string): boolean {
    const stmt = this.db.prepare(
      'DELETE FROM problema_areas WHERE problema_id = ? AND area_codigo = ?'
    );
    const result = stmt.run(problemaId, areaCodigo);
    return result.changes > 0;
  }

  replaceAreas(problemaId: number, areas: Array<{ areaCodigo: string; ordem: number }>): void {
    const deletStmt = this.db.prepare('DELETE FROM problema_areas WHERE problema_id = ?');
    const insertStmt = this.db.prepare(`
      INSERT INTO problema_areas (problema_id, area_codigo, ordem, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `);

    const replaceAll = this.db.transaction((items: Array<{ areaCodigo: string; ordem: number }>) => {
      deletStmt.run(problemaId);
      for (const item of items) {
        insertStmt.run(problemaId, item.areaCodigo, item.ordem);
      }
    });

    replaceAll(areas);
  }

  private mapRow(row: any): Problema {
    return {
      id: row.id,
      codigo: row.codigo,
      descricao: row.descricao,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private mapAreaRow(row: any): ProblemaArea {
    return {
      id: row.id,
      problemaId: row.problema_id,
      areaCodigo: row.area_codigo,
      ordem: row.ordem,
      createdAt: row.created_at,
    };
  }
}
