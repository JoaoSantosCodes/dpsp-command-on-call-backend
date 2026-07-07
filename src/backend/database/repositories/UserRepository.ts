import Database from 'better-sqlite3';
import { User } from '../../../shared/types';

export class UserRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(user: Omit<User, 'id' | 'createdAt' | 'updatedAt'>): User {
    const stmt = this.db.prepare(`
      INSERT INTO users (codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
    const result = stmt.run(
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
    );
    return this.getById(Number(result.lastInsertRowid))!;
  }

  getById(id: number): User | undefined {
    const stmt = this.db.prepare(`
      SELECT id, codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at
      FROM users WHERE id = ?
    `);
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  getByUsername(username: string): User | undefined {
    const stmt = this.db.prepare(`
      SELECT id, codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at
      FROM users WHERE username = ?
    `);
    const row = stmt.get(username) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  getByArea(areaCodigo: string): User[] {
    const stmt = this.db.prepare(`
      SELECT id, codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at
      FROM users WHERE area_codigo = ?
      ORDER BY nome ASC
    `);
    const rows = stmt.all(areaCodigo) as any[];
    return rows.map(this.mapRow);
  }

  getAll(): User[] {
    const stmt = this.db.prepare(`
      SELECT id, codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at
      FROM users ORDER BY nome ASC
    `);
    const rows = stmt.all() as any[];
    return rows.map(this.mapRow);
  }

  update(id: number, data: Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt'>>): User | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.codigo !== undefined) { fields.push('codigo = ?'); values.push(data.codigo); }
    if (data.areaCodigo !== undefined) { fields.push('area_codigo = ?'); values.push(data.areaCodigo || null); }
    if (data.areaSolicitada !== undefined) { fields.push('area_solicitada = ?'); values.push(data.areaSolicitada || null); }
    if (data.nome !== undefined) { fields.push('nome = ?'); values.push(data.nome); }
    if (data.perfil !== undefined) { fields.push('perfil = ?'); values.push(data.perfil); }
    if (data.nivelEscalonamento !== undefined) { fields.push('nivel_escalonamento = ?'); values.push(data.nivelEscalonamento || null); }
    if (data.cargo !== undefined) { fields.push('cargo = ?'); values.push(data.cargo || null); }
    if (data.contato !== undefined) { fields.push('contato = ?'); values.push(data.contato || null); }
    if (data.username !== undefined) { fields.push('username = ?'); values.push(data.username); }
    if (data.senhaHash !== undefined) { fields.push('senha_hash = ?'); values.push(data.senhaHash); }
    if (data.ativo !== undefined) { fields.push('ativo = ?'); values.push(data.ativo ? 1 : 0); }
    if (data.aprovado !== undefined) { fields.push('aprovado = ?'); values.push(data.aprovado ? 1 : 0); }

    if (fields.length === 0) return this.getById(id);

    fields.push("updated_at = datetime('now')");
    values.push(id);

    const stmt = this.db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.getById(id);
  }

  delete(id: number): boolean {
    const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
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
