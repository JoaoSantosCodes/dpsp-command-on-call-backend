import Database from 'better-sqlite3';
import { IncidentRecord, EscalationEvent, HistoryFilters } from '../../../shared/types';

export class IncidentRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(incident: Omit<IncidentRecord, 'acknowledgedAt' | 'acknowledgedBy' | 'resolvedAt' | 'resolvedBy'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO incidents (id, monitor_id, monitor_name, team_id, on_call_person, status, started_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      incident.id,
      incident.monitorId,
      incident.monitorName,
      incident.teamId,
      incident.onCallPerson,
      incident.status,
      incident.startedAt.toISOString()
    );
  }

  getById(id: string): IncidentRecord | undefined {
    const stmt = this.db.prepare(`
      SELECT id, monitor_id, monitor_name, team_id, on_call_person, status,
             started_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by
      FROM incidents
      WHERE id = ?
    `);
    const row = stmt.get(id) as any;
    if (!row) return undefined;
    return this.mapIncidentRow(row);
  }

  getActive(): IncidentRecord[] {
    const stmt = this.db.prepare(`
      SELECT id, monitor_id, monitor_name, team_id, on_call_person, status,
             started_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by
      FROM incidents
      WHERE status IN ('active', 'acknowledged')
    `);
    const rows = stmt.all() as any[];
    return rows.map(this.mapIncidentRow);
  }

  acknowledge(id: string, acknowledgedBy: string, acknowledgedAt: Date): void {
    const stmt = this.db.prepare(`
      UPDATE incidents
      SET status = 'acknowledged', acknowledged_by = ?, acknowledged_at = ?
      WHERE id = ?
    `);
    stmt.run(acknowledgedBy, acknowledgedAt.toISOString(), id);
  }

  resolve(id: string, resolvedBy: string, resolvedAt: Date): void {
    const stmt = this.db.prepare(`
      UPDATE incidents
      SET status = 'resolved', resolved_by = ?, resolved_at = ?
      WHERE id = ?
    `);
    stmt.run(resolvedBy, resolvedAt.toISOString(), id);
  }

  updateStatus(id: string, status: string): void {
    const stmt = this.db.prepare('UPDATE incidents SET status = ? WHERE id = ?');
    stmt.run(status, id);
  }

  query(filters: HistoryFilters): IncidentRecord[] {
    const conditions: string[] = [];
    const params: any[] = [];

    if (filters.teamId) {
      conditions.push('team_id = ?');
      params.push(filters.teamId);
    }

    if (filters.startDate) {
      conditions.push('started_at >= ?');
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push('started_at <= ?');
      params.push(filters.endDate);
    }

    if (filters.status) {
      conditions.push('status = ?');
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const stmt = this.db.prepare(`
      SELECT id, monitor_id, monitor_name, team_id, on_call_person, status,
             started_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by
      FROM incidents
      ${whereClause}
      ORDER BY started_at DESC
    `);

    const rows = stmt.all(...params) as any[];
    return rows.map(this.mapIncidentRow);
  }

  createEscalationEvent(event: Omit<EscalationEvent, 'createdAt'>): void {
    const stmt = this.db.prepare(`
      INSERT INTO escalation_events (incident_id, from_person, to_person, escalation_level, created_at)
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
    stmt.run(
      event.incidentId,
      event.fromPerson,
      event.toPerson,
      event.escalationLevel
    );
  }

  getEscalationEvents(incidentId: string): EscalationEvent[] {
    const stmt = this.db.prepare(`
      SELECT incident_id, from_person, to_person, escalation_level, created_at
      FROM escalation_events
      WHERE incident_id = ?
      ORDER BY escalation_level ASC
    `);
    const rows = stmt.all(incidentId) as any[];
    return rows.map(this.mapEscalationRow);
  }

  private mapIncidentRow(row: any): IncidentRecord {
    return {
      id: row.id,
      monitorId: row.monitor_id,
      monitorName: row.monitor_name,
      teamId: row.team_id,
      onCallPerson: row.on_call_person,
      status: row.status,
      startedAt: new Date(row.started_at),
      acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at) : undefined,
      acknowledgedBy: row.acknowledged_by || undefined,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      resolvedBy: row.resolved_by || undefined,
    };
  }

  private mapEscalationRow(row: any): EscalationEvent {
    return {
      incidentId: row.incident_id,
      fromPerson: row.from_person,
      toPerson: row.to_person,
      escalationLevel: row.escalation_level,
      createdAt: new Date(row.created_at),
    };
  }
}
