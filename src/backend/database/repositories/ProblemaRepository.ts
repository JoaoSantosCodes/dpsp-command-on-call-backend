import { Pool } from 'pg';

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
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async create(data: { codigo: string; descricao: string }): Promise<Problema> {
    const res = await this.db.query(`
      INSERT INTO problemas (codigo, descricao, created_at, updated_at)
      VALUES ($1, $2, NOW(), NOW())
      RETURNING id
    `, [data.codigo, data.descricao]);
    return (await this.getById(Number(res.rows[0].id)))!;
  }

  async getById(id: number): Promise<Problema | undefined> {
    const res = await this.db.query(`
      SELECT id, codigo, descricao, created_at, updated_at
      FROM problemas WHERE id = $1
    `, [id]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async getByCodigo(codigo: string): Promise<Problema | undefined> {
    const res = await this.db.query(`
      SELECT id, codigo, descricao, created_at, updated_at
      FROM problemas WHERE codigo = $1
    `, [codigo]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async getAll(): Promise<Problema[]> {
    const res = await this.db.query(`
      SELECT id, codigo, descricao, created_at, updated_at
      FROM problemas ORDER BY codigo ASC
    `);
    return res.rows.map(this.mapRow);
  }

  async getAllWithAreas(): Promise<ProblemaWithAreas[]> {
    const problemas = await this.getAll();
    const result: ProblemaWithAreas[] = [];
    for (const p of problemas) {
      result.push({
        ...p,
        areas: await this.getAreas(p.id),
      });
    }
    return result;
  }

  async update(id: number, data: { codigo?: string; descricao?: string }): Promise<Problema | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.codigo !== undefined) { fields.push(`codigo = $${idx++}`); values.push(data.codigo); }
    if (data.descricao !== undefined) { fields.push(`descricao = $${idx++}`); values.push(data.descricao); }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = NOW()");
    values.push(id);

    await this.db.query(`UPDATE problemas SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    return this.getById(id);
  }

  async delete(id: number): Promise<boolean> {
    const res = await this.db.query('DELETE FROM problemas WHERE id = $1', [id]);
    return (res.rowCount || 0) > 0;
  }

  // === Problema Areas (grid) ===

  async getAreas(problemaId: number): Promise<ProblemaArea[]> {
    const res = await this.db.query(`
      SELECT id, problema_id, area_codigo, ordem, created_at
      FROM problema_areas WHERE problema_id = $1
      ORDER BY ordem ASC
    `, [problemaId]);
    return res.rows.map(this.mapAreaRow);
  }

  async addArea(problemaId: number, areaCodigo: string, ordem: number): Promise<ProblemaArea> {
    const res = await this.db.query(`
      INSERT INTO problema_areas (problema_id, area_codigo, ordem, created_at)
      VALUES ($1, $2, $3, NOW())
      RETURNING id
    `, [problemaId, areaCodigo, ordem]);
    return {
      id: Number(res.rows[0].id),
      problemaId,
      areaCodigo,
      ordem,
      createdAt: new Date().toISOString(),
    };
  }

  async removeArea(problemaId: number, areaCodigo: string): Promise<boolean> {
    const res = await this.db.query(
      'DELETE FROM problema_areas WHERE problema_id = $1 AND area_codigo = $2',
      [problemaId, areaCodigo]
    );
    return (res.rowCount || 0) > 0;
  }

  async replaceAreas(problemaId: number, areas: Array<{ areaCodigo: string; ordem: number }>): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM problema_areas WHERE problema_id = $1', [problemaId]);
      for (const item of areas) {
        await client.query(`
          INSERT INTO problema_areas (problema_id, area_codigo, ordem, created_at)
          VALUES ($1, $2, $3, NOW())
        `, [problemaId, item.areaCodigo, item.ordem]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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
