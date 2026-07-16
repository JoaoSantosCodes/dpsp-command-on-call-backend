import { Pool } from 'pg';
import { Escala } from '../../../shared/types';

export class EscalaRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async create(escala: Omit<Escala, 'id' | 'createdAt' | 'updatedAt'>): Promise<Escala> {
    const res = await this.db.query(`
      INSERT INTO escalas (codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW(), NOW())
      RETURNING id
    `, [
      escala.codigo,
      escala.areaCodigo,
      escala.periodoCodigo,
      escala.usuarioCodigo
    ]);
    return (await this.getById(Number(res.rows[0].id)))!;
  }

  async getById(id: number): Promise<Escala | undefined> {
    const res = await this.db.query(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas WHERE id = $1
    `, [id]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async getByCodigo(codigo: string): Promise<Escala | undefined> {
    const res = await this.db.query(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas WHERE codigo = $1
    `, [codigo]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async getByArea(areaCodigo: string): Promise<Escala[]> {
    const res = await this.db.query(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas WHERE area_codigo = $1
      ORDER BY created_at ASC
    `, [areaCodigo]);
    return res.rows.map(this.mapRow);
  }

  async getByPeriodo(periodoCodigo: string): Promise<Escala[]> {
    const res = await this.db.query(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas WHERE periodo_codigo = $1
      ORDER BY created_at ASC
    `, [periodoCodigo]);
    return res.rows.map(this.mapRow);
  }

  async getByUsuario(usuarioCodigo: string): Promise<Escala[]> {
    const res = await this.db.query(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas WHERE usuario_codigo = $1
      ORDER BY created_at ASC
    `, [usuarioCodigo]);
    return res.rows.map(this.mapRow);
  }

  async getAll(): Promise<Escala[]> {
    const res = await this.db.query(`
      SELECT id, codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at
      FROM escalas ORDER BY created_at ASC
    `);
    return res.rows.map(this.mapRow);
  }

  async update(id: number, data: Partial<Omit<Escala, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Escala | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.codigo !== undefined) { fields.push(`codigo = $${idx++}`); values.push(data.codigo); }
    if (data.areaCodigo !== undefined) { fields.push(`area_codigo = $${idx++}`); values.push(data.areaCodigo); }
    if (data.periodoCodigo !== undefined) { fields.push(`periodo_codigo = $${idx++}`); values.push(data.periodoCodigo); }
    if (data.usuarioCodigo !== undefined) { fields.push(`usuario_codigo = $${idx++}`); values.push(data.usuarioCodigo); }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = NOW()");
    values.push(id);

    await this.db.query(`UPDATE escalas SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    return this.getById(id);
  }

  async delete(id: number): Promise<boolean> {
    const res = await this.db.query('DELETE FROM escalas WHERE id = $1', [id]);
    return (res.rowCount || 0) > 0;
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
