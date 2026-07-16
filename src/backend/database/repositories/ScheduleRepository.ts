import { Pool } from 'pg';
import { ScheduleEntry } from '../../../shared/types';

export class ScheduleRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async getByTeamAndDateTime(teamId: string, date: string, time: string): Promise<ScheduleEntry | undefined> {
    const res = await this.db.query(`
      SELECT team_id, person_name, person_contact, date, start_time, end_time
      FROM schedules
      WHERE team_id = $1 AND date = $2 AND start_time <= $3 AND end_time > $4
    `, [teamId, date, time, time]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async getByTeam(teamId: string): Promise<ScheduleEntry[]> {
    const res = await this.db.query(`
      SELECT team_id, person_name, person_contact, date, start_time, end_time
      FROM schedules
      WHERE team_id = $1
      ORDER BY date ASC, start_time ASC
    `, [teamId]);
    return res.rows.map(this.mapRow);
  }

  async deleteByTeam(teamId: string): Promise<void> {
    await this.db.query('DELETE FROM schedules WHERE team_id = $1', [teamId]);
  }

  async insertMany(entries: ScheduleEntry[]): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      for (const entry of entries) {
        await client.query(`
          INSERT INTO schedules (team_id, person_name, person_contact, date, start_time, end_time)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          entry.teamId,
          entry.personName,
          entry.personContact || null,
          entry.date,
          entry.startTime,
          entry.endTime
        ]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async insertOne(entry: ScheduleEntry): Promise<void> {
    await this.db.query(`
      INSERT INTO schedules (team_id, person_name, person_contact, date, start_time, end_time)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      entry.teamId,
      entry.personName,
      entry.personContact || null,
      entry.date,
      entry.startTime,
      entry.endTime
    ]);
  }

  private mapRow(row: any): ScheduleEntry {
    return {
      teamId: row.team_id,
      personName: row.person_name,
      personContact: row.person_contact || undefined,
      date: row.date,
      startTime: row.start_time,
      endTime: row.end_time,
    };
  }
}
