import { Monitor, MonitorMapping } from '../../shared/types';
import { MonitorMappingRepository } from '../database/repositories/MonitorMappingRepository';

export class MonitorMappingService {
  private repository: MonitorMappingRepository;

  constructor(repository: MonitorMappingRepository) {
    this.repository = repository;
  }

  getTeamForMonitor(monitorId: number): string | null {
    const mapping = this.repository.getByMonitorId(monitorId);
    return mapping ? mapping.teamId : null;
  }

  setMonitorTeamMapping(monitorId: number, teamId: string, monitorName: string): void {
    this.repository.setMapping(monitorId, teamId, monitorName);
  }

  getUnmappedMonitors(allMonitors: Monitor[]): Monitor[] {
    const allMapped = this.repository.getAllMapped();
    const mappedIds = new Set(allMapped.map((m) => m.monitorId));
    return allMonitors.filter((monitor) => !mappedIds.has(monitor.id));
  }

  getMappingsForTeam(teamId: string): MonitorMapping[] {
    return this.repository.getByTeamId(teamId);
  }
}
