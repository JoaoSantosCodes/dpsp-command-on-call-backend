import { v4 as uuidv4 } from 'uuid';
import {
  IncidentRecord,
  EscalationRecord,
  ResolutionRecord,
  HistoryFilters,
  EscalationEvent,
} from '../../shared/types';
import { IncidentRepository } from '../database/repositories/IncidentRepository';

export class IncidentHistoryService {
  private repository: IncidentRepository;

  constructor(repository: IncidentRepository) {
    this.repository = repository;
  }

  async recordIncident(incident: IncidentRecord): Promise<string> {
    const id = incident.id || uuidv4();

    await this.repository.create({
      id,
      monitorId: incident.monitorId,
      monitorName: incident.monitorName,
      teamId: incident.teamId,
      onCallPerson: incident.onCallPerson,
      status: incident.status,
      startedAt: incident.startedAt,
    });

    return id;
  }

  async recordEscalation(incidentId: string, escalation: EscalationRecord): Promise<void> {
    await this.repository.createEscalationEvent({
      incidentId,
      fromPerson: escalation.fromPerson,
      toPerson: escalation.toPerson,
      escalationLevel: escalation.escalationLevel,
    });
  }

  async recordResolution(incidentId: string, resolution: ResolutionRecord): Promise<void> {
    await this.repository.resolve(incidentId, resolution.resolvedBy, resolution.resolvedAt);
  }

  async queryHistory(filters: HistoryFilters): Promise<IncidentRecord[]> {
    return this.repository.query(filters);
  }
}
