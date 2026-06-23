import Database from 'better-sqlite3';
import { MonitorAreaMapping } from '../../../shared/types';

export class MonitorAreaMappingRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getByMonitorId(monitorId: number): MonitorAreaMapping | undefined {
    const stmt = this.db.prepare(
      'SELECT monitor_id, area_codigo, monitor_name, created_at, updated_at FROM monitor_area_mapping WHERE monitor_id = ?'
    );
    const row = stmt.get(monitorId) as any;
    if (!row) return undefined;
    return this.mapRow(row);
  }

  setMapping(monitorId: number, areaCodigo: string, monitorName: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO monitor_area_mapping (monitor_id, area_codigo, monitor_name, created_at, updated_at)
      VALUES (?, ?, ?, datetime('now'), datetime('now'))
      ON CONFLICT(monitor_id) DO UPDATE SET
        area_codigo = excluded.area_codigo,
        monitor_name = excluded.monitor_name,
        updated_at = datetime('now')
    `);
    stmt.run(monitorId, areaCodigo, monitorName);
  }

  getByArea(areaCodigo: string): MonitorAreaMapping[] {
    const stmt = this.db.prepare(
      'SELECT monitor_id, area_codigo, monitor_name, created_at, updated_at FROM monitor_area_mapping WHERE area_codigo = ?'
    );
    const rows = stmt.all(areaCodigo) as any[];
    return rows.map(this.mapRow);
  }

  getAllMapped(): MonitorAreaMapping[] {
    const stmt = this.db.prepare(
      'SELECT monitor_id, area_codigo, monitor_name, created_at, updated_at FROM monitor_area_mapping'
    );
    const rows = stmt.all() as any[];
    return rows.map(this.mapRow);
  }

  deleteMapping(monitorId: number): void {
    const stmt = this.db.prepare('DELETE FROM monitor_area_mapping WHERE monitor_id = ?');
    stmt.run(monitorId);
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
