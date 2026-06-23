import Database from 'better-sqlite3';
import { Periodo } from '../../../shared/types';

export class PeriodoRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(periodo: Omit<Periodo, 'id' | 'createdAt' | 'updatedAt'>): Periodo {
    const stmt = this.db.prepare(`
      INSERT INTO periodos (codigo, data, horarios, area_codigo, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(periodo.codigo, periodo.data, periodo.horarios, periodo.areaCodigo);
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): Periodo | undefined {
    const stmt = this.db.prepare(`
      SELECT id, codigo, data, horarios, area_codigo, created_at, updated_at
      FROM periodos WHERE id = ?
    `);
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  getByCodigo(codigo: string): Periodo | undefined {
    const stmt = this.db.prepare(`
      SELECT id, codigo, data, horarios, area_codigo, created_at, updated_at
      FROM periodos WHERE codigo = ?
    `);
    const row = stmt.get(codigo) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  getByArea(areaCodigo: string): Periodo[] {
    const stmt = this.db.prepare(`
      SELECT id, codigo, data, horarios, area_codigo, created_at, updated_at
      FROM periodos WHERE area_codigo = ?
      ORDER BY data ASC
    `);
    const rows = stmt.all(areaCodigo) as any[];
    return rows.map(this.mapRow);
  }

  getAll(): Periodo[] {
    const stmt = this.db.prepare(`
      SELECT id, codigo, data, horarios, area_codigo, created_at, updated_at
      FROM periodos ORDER BY data ASC
    `);
    const rows = stmt.all() as any[];
    return rows.map(this.mapRow);
  }

  update(id: number, data: Partial<Omit<Periodo, 'id' | 'createdAt' | 'updatedAt'>>): Periodo | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.codigo !== undefined) { fields.push('codigo = ?'); values.push(data.codigo); }
    if (data.data !== undefined) { fields.push('data = ?'); values.push(data.data); }
    if (data.horarios !== undefined) { fields.push('horarios = ?'); values.push(data.horarios); }
    if (data.areaCodigo !== undefined) { fields.push('area_codigo = ?'); values.push(data.areaCodigo); }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = this.db.prepare(`UPDATE periodos SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.getById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM periodos WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  deleteById(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM periodos WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  /**
   * Auto-generate a unique periodo code.
   * Format: PER-{AREA_SHORT}-{YYYYMMDD}-{SEQ}
   * AREA_SHORT = first 8 chars of areaCodigo (uppercase)
   * SEQ = zero-padded 3-digit sequence number
   */
  generateCode(areaCodigo: string, data: string): string {
    const areaShort = areaCodigo.substring(0, 8).toUpperCase();
    const dateStr = data.replace(/-/g, ''); // YYYY-MM-DD -> YYYYMMDD

    const prefix = `PER-${areaShort}-${dateStr}-`;

    // Find existing codes with same prefix to determine next sequence
    const stmt = this.db.prepare(
      `SELECT codigo FROM periodos WHERE codigo LIKE ? ORDER BY codigo DESC LIMIT 1`
    );

    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = stmt.get(`${prefix}%`) as { codigo: string } | undefined;
      let seq = 1;

      if (existing) {
        const lastSeqStr = existing.codigo.substring(prefix.length);
        const lastSeq = parseInt(lastSeqStr, 10);
        if (!isNaN(lastSeq)) {
          seq = lastSeq + 1;
        }
      }

      const code = `${prefix}${seq.toString().padStart(3, '0')}`;

      // Verify no collision
      const collision = this.getByCodigo(code);
      if (!collision) {
        return code;
      }
      // If collision, increment and retry
      seq++;
    }

    // Fallback: use timestamp-based suffix
    const fallbackSeq = Date.now() % 1000;
    return `${prefix}${fallbackSeq.toString().padStart(3, '0')}`;
  }

  private mapRow(row: any): Periodo {
    return {
      id: row.id,
      codigo: row.codigo,
      data: row.data,
      horarios: row.horarios,
      areaCodigo: row.area_codigo,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
