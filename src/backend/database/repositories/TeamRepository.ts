import Database from 'better-sqlite3';

export interface TeamRow {
  id: string;
  name: string;
  displayOrder: number;
}

export class TeamRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getAll(): TeamRow[] {
    const stmt = this.db.prepare(
      'SELECT id, name, display_order FROM teams ORDER BY display_order ASC'
    );
    const rows = stmt.all() as any[];
    return rows.map(this.mapRow);
  }

  getById(id: string): TeamRow | undefined {
    const stmt = this.db.prepare('SELECT id, name, display_order FROM teams WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  exists(id: string): boolean {
    const stmt = this.db.prepare('SELECT 1 FROM teams WHERE id = ?');
    return stmt.get(id) !== undefined;
  }

  create(team: TeamRow): TeamRow {
    const stmt = this.db.prepare(
      'INSERT INTO teams (id, name, display_order) VALUES (?, ?, ?)'
    );
    stmt.run(team.id, team.name, team.displayOrder);
    return this.getById(team.id)!;
  }

  update(id: string, data: Partial<Omit<TeamRow, 'id'>>): TeamRow | undefined {
    const fields: string[] = [];
    const values: any[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); values.push(data.name); }
    if (data.displayOrder !== undefined) { fields.push('display_order = ?'); values.push(data.displayOrder); }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    const stmt = this.db.prepare(`UPDATE teams SET ${fields.join(', ')} WHERE id = ?`);
    stmt.run(...values);
    return this.getById(id);
  }

  delete(id: string): boolean {
    const stmt = this.db.prepare('DELETE FROM teams WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  private mapRow(row: any): TeamRow {
    return {
      id: row.id,
      name: row.name,
      displayOrder: row.display_order,
    };
  }
}
