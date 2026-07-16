import { Pool } from 'pg';
import { User } from '../../../shared/types';

export class UserRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): Promise<User> {
    const res = await this.db.query(`
      INSERT INTO users (codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
      RETURNING id
    `, [
      user.codigo,
      user.areaCodigo || null,
      user.areaSolicitada || null,
      user.nome,
      user.perfil,
      user.nivelEscalonamento || null,
      user.cargo || null,
      user.contato || null,
      user.username,
      user.senhaHash,
      user.ativo !== undefined ? (user.ativo ? 1 : 0) : 1,
      user.aprovado !== undefined ? (user.aprovado ? 1 : 0) : 1
    ]);
    return (await this.getById(Number(res.rows[0].id)))!;
  }

  async getById(id: number): Promise<User | undefined> {
    const res = await this.db.query(`
      SELECT id, codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at
      FROM users WHERE id = $1
    `, [id]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async getByUsername(username: string): Promise<User | undefined> {
    const res = await this.db.query(`
      SELECT id, codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at
      FROM users WHERE username = $1
    `, [username]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async getByArea(areaCodigo: string): Promise<User[]> {
    const res = await this.db.query(`
      SELECT id, codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at
      FROM users WHERE area_codigo = $1
      ORDER BY nome ASC
    `, [areaCodigo]);
    return res.rows.map(this.mapRow);
  }

  async getAll(): Promise<User[]> {
    const res = await this.db.query(`
      SELECT id, codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at
      FROM users ORDER BY nome ASC
    `);
    return res.rows.map(this.mapRow);
  }

  async update(id: number, data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>): Promise<User | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.codigo !== undefined) { fields.push(`codigo = $${idx++}`); values.push(data.codigo); }
    if (data.areaCodigo !== undefined) { fields.push(`area_codigo = $${idx++}`); values.push(data.areaCodigo || null); }
    if (data.areaSolicitada !== undefined) { fields.push(`area_solicitada = $${idx++}`); values.push(data.areaSolicitada || null); }
    if (data.nome !== undefined) { fields.push(`nome = $${idx++}`); values.push(data.nome); }
    if (data.perfil !== undefined) { fields.push(`perfil = $${idx++}`); values.push(data.perfil); }
    if (data.nivelEscalonamento !== undefined) { fields.push(`nivel_escalonamento = $${idx++}`); values.push(data.nivelEscalonamento || null); }
    if (data.cargo !== undefined) { fields.push(`cargo = $${idx++}`); values.push(data.cargo || null); }
    if (data.contato !== undefined) { fields.push(`contato = $${idx++}`); values.push(data.contato || null); }
    if (data.username !== undefined) { fields.push(`username = $${idx++}`); values.push(data.username); }
    if (data.senhaHash !== undefined) { fields.push(`senha_hash = $${idx++}`); values.push(data.senhaHash); }
    if (data.ativo !== undefined) { fields.push(`ativo = $${idx++}`); values.push(data.ativo ? 1 : 0); }
    if (data.aprovado !== undefined) { fields.push(`aprovado = $${idx++}`); values.push(data.aprovado ? 1 : 0); }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = NOW()");
    values.push(id);

    await this.db.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    return this.getById(id);
  }

  async delete(id: number): Promise<boolean> {
    const res = await this.db.query('DELETE FROM users WHERE id = $1', [id]);
    return (res.rowCount || 0) > 0;
  }

  private mapRow(row: any): User {
    return {
      id: row.id,
      codigo: row.codigo,
      areaCodigo: row.area_codigo || null,
      areaSolicitada: row.area_solicitada || null,
      nome: row.nome,
      perfil: row.perfil,
      nivelEscalonamento: row.nivel_escalonamento || null,
      cargo: row.cargo || null,
      contato: row.contato || null,
      username: row.username,
      senhaHash: row.senha_hash,
      ativo: row.ativo !== 0,
      aprovado: row.aprovado !== 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
