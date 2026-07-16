import { Pool } from 'pg';

export interface TeamRow {
  id: string;
  name: string;
  displayOrder: number;
}

export class TeamRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async getAll(): Promise<TeamRow[]> {
    const res = await this.db.query(
      'SELECT id, name, display_order FROM teams ORDER BY display_order ASC'
    );
    return res.rows.map(this.mapRow);
  }

  async getById(id: string): Promise<TeamRow | undefined> {
    const res = await this.db.query('SELECT id, name, display_order FROM teams WHERE id = $1', [id]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async exists(id: string): Promise<boolean> {
    const res = await this.db.query('SELECT 1 FROM teams WHERE id = $1', [id]);
    return res.rows.length > 0;
  }

  async create(team: TeamRow): Promise<TeamRow> {
    await this.db.query(
      'INSERT INTO teams (id, name, display_order) VALUES ($1, $2, $3)'
    , [team.id, team.name, team.displayOrder]);
    return (await this.getById(team.id))!;
  }

  async update(id: string, data: Partial<Omit<TeamRow, 'id'>>): Promise<TeamRow | undefined> {
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    if (data.name !== undefined) { fields.push(`name = $${idx++}`); values.push(data.name); }
    if (data.displayOrder !== undefined) { fields.push(`display_order = $${idx++}`); values.push(data.displayOrder); }

    if (fields.length === 0) return this.getById(id);

    values.push(id);
    await this.db.query(`UPDATE teams SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    return this.getById(id);
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db.query('DELETE FROM teams WHERE id = $1', [id]);
    return (res.rowCount || 0) > 0;
  }

  private mapRow(row: any): TeamRow {
    return {
      id: row.id,
      name: row.name,
      displayOrder: row.display_order,
    };
  }
}
