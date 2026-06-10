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

  recordIncident(incident: IncidentRecord): string {
    const id = incident.id || uuidv4();

    this.repository.create({
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

  recordEscalation(incidentId: string, escalation: EscalationRecord): void {
    this.repository.createEscalationEvent({
      incidentId,
      fromPerson: escalation.fromPerson,
      toPerson: escalation.toPerson,
      escalationLevel: escalation.escalationLevel,
    });
  }

  recordResolution(incidentId: string, resolution: ResolutionRecord): void {
    this.repository.resolve(incidentId, resolution.resolvedBy, resolution.resolvedAt);
  }

  queryHistory(filters: HistoryFilters): IncidentRecord[] {
    return this.repository.query(filters);
  }
}
