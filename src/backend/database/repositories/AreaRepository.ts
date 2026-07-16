import { Pool } from 'pg';
import { Area } from '../../../shared/types';

export class AreaRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async create(area: Omit<Area, 'id' | 'createdAt' | 'updatedAt'>): Promise<Area> {
    const res = await this.db.query(`
      INSERT INTO areas (codigo, nome, torre, coordenador_nome, coordenador_contato, gerente_nome, gerente_contato, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING id
    `, [area.codigo, area.nome, area.torre || null, area.coordenadorNome || null, area.coordenadorContato || null, area.gerenteNome || null, area.gerenteContato || null]);
    return (await this.getById(res.rows[0].id))!;
  }

  async getById(id: number): Promise<Area | undefined> {
    const res = await this.db.query(`
      SELECT id, codigo, nome, torre, coordenador_nome, coordenador_contato, gerente_nome, gerente_contato, created_at, updated_at
      FROM areas WHERE id = $1
    `, [id]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async getByCodigo(codigo: string): Promise<Area | undefined> {
    const res = await this.db.query(`
      SELECT id, codigo, nome, torre, coordenador_nome, coordenador_contato, gerente_nome, gerente_contato, created_at, updated_at
      FROM areas WHERE codigo = $1
    `, [codigo]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async getAll(): Promise<Area[]> {
    const res = await this.db.query(`
      SELECT id, codigo, nome, torre, coordenador_nome, coordenador_contato, gerente_nome, gerente_contato, created_at, updated_at
      FROM areas ORDER BY nome ASC
    `);
    return res.rows.map(this.mapRow);
  }

  async update(id: number, data: Partial<Omit<Area, 'id' | 'createdAt' | 'updatedAt'>>): Promise<Area | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.codigo !== undefined) { fields.push(`codigo = $${idx++}`); values.push(data.codigo); }
    if (data.nome !== undefined) { fields.push(`nome = $${idx++}`); values.push(data.nome); }
    if (data.torre !== undefined) { fields.push(`torre = $${idx++}`); values.push(data.torre || null); }
    if (data.coordenadorNome !== undefined) { fields.push(`coordenador_nome = $${idx++}`); values.push(data.coordenadorNome || null); }
    if (data.coordenadorContato !== undefined) { fields.push(`coordenador_contato = $${idx++}`); values.push(data.coordenadorContato || null); }
    if (data.gerenteNome !== undefined) { fields.push(`gerente_nome = $${idx++}`); values.push(data.gerenteNome || null); }
    if (data.gerenteContato !== undefined) { fields.push(`gerente_contato = $${idx++}`); values.push(data.gerenteContato || null); }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = NOW()");
    values.push(id);

    await this.db.query(`UPDATE areas SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    return this.getById(id);
  }

  async delete(id: number): Promise<boolean> {
    const res = await this.db.query('DELETE FROM areas WHERE id = $1', [id]);
    return (res.rowCount || 0) > 0;
  }

  private mapRow(row: any): Area {
    return {
      id: row.id,
      codigo: row.codigo,
      nome: row.nome,
      torre: row.torre || null,
      coordenadorNome: row.coordenador_nome || null,
      coordenadorContato: row.coordenador_contato || null,
      gerenteNome: row.gerente_nome || null,
      gerenteContato: row.gerente_contato || null,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
