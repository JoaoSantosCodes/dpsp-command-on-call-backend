import Database from 'better-sqlite3';
import { ScheduleEntry } from '../../../shared/types';

export class ScheduleRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getByTeamAndDateTime(teamId: string, date: string, time: string): ScheduleEntry | undefined {
    const stmt = this.db.prepare(`
      SELECT team_id, person_name, person_contact, date, start_time, end_time
      FROM schedules
      WHERE team_id = ? AND date = ? AND start_time <= ? AND end_time > ?
    `);
    const row = stmt.get(teamId, date, time, time) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  getByTeam(teamId: string): ScheduleEntry[] {
    const stmt = this.db.prepare(`
      SELECT team_id, person_name, person_contact, date, start_time, end_time
      FROM schedules
      WHERE team_id = ?
      ORDER BY date ASC, start_time ASC
    `);
    const rows = stmt.all(teamId) as any[];
    return rows.map(this.mapRow);
  }

  deleteByTeam(teamId: string): void {
    const stmt = this.db.prepare('DELETE FROM schedules WHERE team_id = ?');
    stmt.run(teamId);
  }

  insertMany(entries: ScheduleEntry[]): void {
    const stmt = this.db.prepare(`
      INSERT INTO schedules (team_id, person_name, person_contact, date, start_time, end_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const insertAll = this.db.transaction((items: ScheduleEntry[]) => {
      for (const entry of items) {
        stmt.run(
          entry.teamId,
          entry.personName,
          entry.personContact || null,
          entry.date,
          entry.startTime,
          entry.endTime
        );
      }
    });

    insertAll(entries);
  }

  insertOne(entry: ScheduleEntry): void {
    const stmt = this.db.prepare(`
      INSERT INTO schedules (team_id, person_name, person_contact, date, start_time, end_time)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      entry.teamId,
      entry.personName,
      entry.personContact || null,
      entry.date,
      entry.startTime,
      entry.endTime
    );
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
