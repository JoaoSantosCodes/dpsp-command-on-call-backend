import Database from 'better-sqlite3';
import { MonitorMapping } from '../../shared/types';

export class MonitorMappingRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getByMonitorId(monitorId: number): MonitorMapping | undefined {
    const stmt = this.db.prepare(
      'SELECT monitor_id, team_id, monitor_name, created_at, updated_at FROM monitor_team_mapping WHERE monitor_id = ?'
    );
    const row = stmt.get(monitorId) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  setMapping(monitorId: number, teamId: string, monitorName: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO monitor_team_mapping (monitor_id, team_id, monitor_name, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(monitor_id) DO UPDATE SET
        team_id = excluded.team_id,
        monitor_name = excluded.monitor_name,
        updated_at = datetime('now')
    `);
    stmt.run(monitorId, teamId, monitorName);
  }

  getByTeamId(teamId: string): MonitorMapping[] {
    const stmt = this.db.prepare(
      'SELECT monitor_id, team_id, monitor_name, created_at, updated_at FROM monitor_team_mapping WHERE team_id = ?'
    );
    const rows = stmt.all(teamId) as any[];
    return rows.map(this.mapRow);
  }

  getAllMapped(): MonitorMapping[] {
    const stmt = this.db.prepare(
      'SELECT monitor_id, team_id, monitor_name, created_at, updated_at FROM monitor_team_mapping'
    );
    const rows = stmt.all() as any[];
    return rows.map(this.mapRow);
  }

  deleteMapping(monitorId: number): void {
    const stmt = this.db.prepare('DELETE FROM monitor_team_mapping WHERE monitor_id = ?');
    stmt.run(monitorId);
  }

  private mapRow(row: any): MonitorMapping {
    return {
      monitorId: row.monitor_id,
      teamId: row.team_id,
      monitorName: row.monitor_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
