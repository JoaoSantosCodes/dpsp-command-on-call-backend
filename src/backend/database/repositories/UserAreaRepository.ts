import Database from 'better-sqlite3';

export class UserAreaRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getAreasForUser(userId: number): string[] {
    const stmt = this.db.prepare(`
      SELECT area_codigo FROM user_areas WHERE user_id = ?
    `);
    const rows = stmt.all(userId) as { area_codigo: string }[];
    return rows.map((row) => row.area_codigo);
  }

  addAreaBinding(userId: number, areaCodigo: string): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO user_areas (user_id, area_codigo)
      VALUES (?, ?)
    `);
    stmt.run(userId, areaCodigo);
  }

  removeAreaBinding(userId: number, areaCodigo: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM user_areas WHERE user_id = ? AND area_codigo = ?
    `);
    stmt.run(userId, areaCodigo);
  }

  getUsersForArea(areaCodigo: string): number[] {
    const stmt = this.db.prepare(`
      SELECT user_id FROM user_areas WHERE area_codigo = ?
    `);
    const rows = stmt.all(areaCodigo) as { user_id: number }[];
    return rows.map((row) => row.user_id);
  }
}
