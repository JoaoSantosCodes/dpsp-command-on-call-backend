import { Pool } from 'pg';

export class UserAreaRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async getAreasForUser(userId: number): Promise<string[]> {
    const res = await this.db.query(`
      SELECT area_codigo FROM user_areas WHERE user_id = $1
    `, [userId]);
    return res.rows.map((row) => row.area_codigo);
  }

  async addAreaBinding(userId: number, areaCodigo: string): Promise<void> {
    await this.db.query(`
      INSERT INTO user_areas (user_id, area_codigo)
      VALUES ($1, $2)
      ON CONFLICT DO NOTHING
    `, [userId, areaCodigo]);
  }

  async removeAreaBinding(userId: number, areaCodigo: string): Promise<void> {
    await this.db.query(`
      DELETE FROM user_areas WHERE user_id = $1 AND area_codigo = $2
    `, [userId, areaCodigo]);
  }

  async getUsersForArea(areaCodigo: string): Promise<number[]> {
    const res = await this.db.query(`
      SELECT user_id FROM user_areas WHERE area_codigo = $1
    `, [areaCodigo]);
    return res.rows.map((row) => row.user_id);
  }
}
