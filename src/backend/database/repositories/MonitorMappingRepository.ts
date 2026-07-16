import { Pool } from 'pg';
import { MonitorMapping } from '../../../shared/types';

export class MonitorMappingRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async getByMonitorId(monitorId: number): Promise<MonitorMapping | undefined> {
    const res = await this.db.query(
      'SELECT monitor_id, team_id, monitor_name, created_at, updated_at FROM monitor_team_mapping WHERE monitor_id = $1',
      [monitorId]
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async setMapping(monitorId: number, teamId: string, monitorName: string): Promise<void> {
    await this.db.query(`
      INSERT INTO monitor_team_mapping (monitor_id, team_id, monitor_name, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT(monitor_id) DO UPDATE SET
        team_id = excluded.team_id,
        monitor_name = excluded.monitor_name,
        updated_at = NOW()
    `, [monitorId, teamId, monitorName]);
  }

  async getByTeamId(teamId: string): Promise<MonitorMapping[]> {
    const res = await this.db.query(
      'SELECT monitor_id, team_id, monitor_name, created_at, updated_at FROM monitor_team_mapping WHERE team_id = $1',
      [teamId]
    );
    return res.rows.map(this.mapRow);
  }

  async getAllMapped(): Promise<MonitorMapping[]> {
    const res = await this.db.query(
      'SELECT monitor_id, team_id, monitor_name, created_at, updated_at FROM monitor_team_mapping'
    );
    return res.rows.map(this.mapRow);
  }

  async deleteMapping(monitorId: number): Promise<void> {
    await this.db.query('DELETE FROM monitor_team_mapping WHERE monitor_id = $1', [monitorId]);
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
