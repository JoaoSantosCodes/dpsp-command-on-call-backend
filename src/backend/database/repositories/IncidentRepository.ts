import { Pool } from 'pg';
import { IncidentRecord, EscalationEvent, HistoryFilters } from '../../../shared/types';

export class IncidentRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async create(incident: Omit<IncidentRecord, 'acknowledgedAt' | 'acknowledgedBy' | 'resolvedAt' | 'resolvedBy'>): Promise<void> {
    await this.db.query(`
      INSERT INTO incidents (id, monitor_id, monitor_name, team_id, on_call_person, status, started_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [
      incident.id,
      incident.monitorId,
      incident.monitorName,
      incident.teamId,
      incident.onCallPerson,
      incident.status,
      incident.startedAt.toISOString()
    ]);
  }

  async getById(id: string): Promise<IncidentRecord | undefined> {
    const res = await this.db.query(`
      SELECT id, monitor_id, monitor_name, team_id, on_call_person, status,
             started_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by
      FROM incidents
      WHERE id = $1
    `, [id]);
    const row = res.rows[0];
    if (!row) return undefined;
    return this.mapIncidentRow(row);
  }

  async getActive(): Promise<IncidentRecord[]> {
    const res = await this.db.query(`
      SELECT id, monitor_id, monitor_name, team_id, on_call_person, status,
             started_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by
      FROM incidents
      WHERE status IN ('active', 'acknowledged')
    `);
    return res.rows.map(this.mapIncidentRow);
  }

  async acknowledge(id: string, acknowledgedBy: string, acknowledgedAt: Date): Promise<void> {
    await this.db.query(`
      UPDATE incidents
      SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = $2
      WHERE id = $3
    `, [acknowledgedBy, acknowledgedAt.toISOString(), id]);
  }

  async resolve(id: string, resolvedBy: string, resolvedAt: Date): Promise<void> {
    await this.db.query(`
      UPDATE incidents
      SET status = 'resolved', resolved_by = $1, resolved_at = $2
      WHERE id = $3
    `, [resolvedBy, resolvedAt.toISOString(), id]);
  }

  async updateStatus(id: string, status: string): Promise<void> {
    await this.db.query('UPDATE incidents SET status = $1 WHERE id = $2', [status, id]);
  }

  async query(filters: HistoryFilters): Promise<IncidentRecord[]> {
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (filters.teamId) {
      conditions.push(`team_id = $${idx++}`);
      params.push(filters.teamId);
    }

    if (filters.startDate) {
      conditions.push(`started_at >= $${idx++}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      conditions.push(`started_at <= $${idx++}`);
      params.push(filters.endDate);
    }

    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      params.push(filters.status);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const res = await this.db.query(`
      SELECT id, monitor_id, monitor_name, team_id, on_call_person, status,
             started_at, acknowledged_at, acknowledged_by, resolved_at, resolved_by
      FROM incidents
      ${whereClause}
      ORDER BY started_at DESC
    `, params);

    return res.rows.map(this.mapIncidentRow);
  }

  async createEscalationEvent(event: Omit<EscalationEvent, 'createdAt'>): Promise<void> {
    await this.db.query(`
      INSERT INTO escalation_events (incident_id, from_person, to_person, escalation_level, created_at)
      VALUES ($1, $2, $3, $4, NOW())
    `, [
      event.incidentId,
      event.fromPerson,
      event.toPerson,
      event.escalationLevel
    ]);
  }

  async getEscalationEvents(incidentId: string): Promise<EscalationEvent[]> {
    const res = await this.db.query(`
      SELECT incident_id, from_person, to_person, escalation_level, created_at
      FROM escalation_events
      WHERE incident_id = $1
      ORDER BY escalation_level ASC
    `, [incidentId]);
    return res.rows.map(this.mapEscalationRow);
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
