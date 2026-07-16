import { Pool } from 'pg';
import { Periodo } from '../../../shared/types';

export class PeriodoRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async create(periodo: Omit<Periodo, 'id' | 'createdAt' | 'updatedAt'>): Promise<Periodo> {
    const res = await this.db.query(`
      INSERT INTO periodos (codigo, data, horarios, area_codigo, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING id
    `, [periodo.codigo, periodo.data, periodo.horarios, periodo.areaCodigo]);
    return (await this.getById(Number(res.rows[0].id)))!;
  }

  async getById(id: number): Promise<Periodo | undefined> {
    const res = await this.db.query(`
      SELECT id, codigo, data, horarios, area_codigo, created_at, updated_at
      FROM periodos WHERE id = $1
    `, [id]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async getByCodigo(codigo: string): Promise<Periodo | undefined> {
    const res = await this.db.query(`
      SELECT id, codigo, data, horarios, area_codigo, created_at, updated_at
      FROM periodos WHERE codigo = $1
    `, [codigo]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async getByArea(areaCodigo: string): Promise<Periodo[]> {
    const res = await this.db.query(`
      SELECT id, codigo, data, horarios, area_codigo, created_at, updated_at
      FROM periodos WHERE area_codigo = $1
      ORDER BY data ASC
    `, [areaCodigo]);
    return res.rows.map(this.mapRow);
  }

  async getAll(): Promise<Periodo[]> {
    const res = await this.db.query(`
      SELECT id, codigo, data, horarios, area_codigo, created_at, updated_at
      FROM periodos ORDER BY data ASC
    `);
    return res.rows.map(this.mapRow);
  }

  async update(id: number, data: Partial<Omit<Periodo, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Periodo | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.codigo !== undefined) { fields.push(`codigo = $${idx++}`); values.push(data.codigo); }
    if (data.data !== undefined) { fields.push(`data = $${idx++}`); values.push(data.data); }
    if (data.horarios !== undefined) { fields.push(`horarios = $${idx++}`); values.push(data.horarios); }
    if (data.areaCodigo !== undefined) { fields.push(`area_codigo = $${idx++}`); values.push(data.areaCodigo); }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = NOW()");
    values.push(id);

    await this.db.query(`UPDATE periodos SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    return this.getById(id);
  }

  async delete(id: number): Promise<boolean> {
    const res = await this.db.query('DELETE FROM periodos WHERE id = $1', [id]);
    return (res.rowCount || 0) > 0;
  }

  async deleteById(id: number): Promise<boolean> {
    const res = await this.db.query('DELETE FROM periodos WHERE id = $1', [id]);
    return (res.rowCount || 0) > 0;
  }

  async generateCode(areaCodigo: string, data: string): Promise<string> {
    const areaShort = areaCodigo.substring(0, 8).toUpperCase();
    const dateStr = data.replace(/-/g, '');

    const prefix = `PER-${areaShort}-${dateStr}-`;

    for (let attempt = 0; attempt < 3; attempt++) {
      const res = await this.db.query(
        `SELECT codigo FROM periodos WHERE codigo LIKE $1 ORDER BY codigo DESC LIMIT 1`,
        [`${prefix}%`]
      );
      const existing = res.rows[0] as { codigo: string } | undefined;
      let seq = 1;

      if (existing) {
        const lastSeqStr = existing.codigo.substring(prefix.length);
        const lastSeq = parseInt(lastSeqStr, 10);
        if (!isNaN(lastSeq)) {
          seq = lastSeq + 1;
        }
      }

      const code = `${prefix}${seq.toString().padStart(3, '0')}`;

      const collision = await this.getByCodigo(code);
      if (!collision) {
        return code;
      }
      seq++;
    }

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
