import { Pool } from 'pg';
import { MonitorAreaMapping } from '../../../shared/types';

export class MonitorAreaMappingRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async getByMonitorId(monitorId: number): Promise<MonitorAreaMapping | undefined> {
    const res = await this.db.query(
      'SELECT monitor_id, area_codigo, monitor_name, created_at, updated_at FROM monitor_area_mapping WHERE monitor_id = $1',
      [monitorId]
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapRow(row);
  }

  async setMapping(monitorId: number, areaCodigo: string, monitorName: string): Promise<void> {
    await this.db.query(`
      INSERT INTO monitor_area_mapping (monitor_id, area_codigo, monitor_name, created_at, updated_at)
      VALUES ($1, $2, $3, NOW(), NOW())
      ON CONFLICT(monitor_id) DO UPDATE SET
        area_codigo = excluded.area_codigo,
        monitor_name = excluded.monitor_name,
        updated_at = NOW()
    `, [monitorId, areaCodigo, monitorName]);
  }

  async getByArea(areaCodigo: string): Promise<MonitorAreaMapping[]> {
    const res = await this.db.query(
      'SELECT monitor_id, area_codigo, monitor_name, created_at, updated_at FROM monitor_area_mapping WHERE area_codigo = $1',
      [areaCodigo]
    );
    return res.rows.map(this.mapRow);
  }

  async getAllMapped(): Promise<MonitorAreaMapping[]> {
    const res = await this.db.query(
      'SELECT monitor_id, area_codigo, monitor_name, created_at, updated_at FROM monitor_area_mapping'
    );
    return res.rows.map(this.mapRow);
  }

  async deleteMapping(monitorId: number): Promise<void> {
    await this.db.query('DELETE FROM monitor_area_mapping WHERE monitor_id = $1', [monitorId]);
  }

  private mapRow(row: any): MonitorAreaMapping {
    return {
      monitorId: row.monitor_id,
      areaCodigo: row.area_codigo,
      monitorName: row.monitor_name,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
