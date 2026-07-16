import { Monitor, MonitorMapping } from '../../shared/types';
import { MonitorMappingRepository } from '../database/repositories/MonitorMappingRepository';

export class MonitorMappingService {
  private repository: MonitorMappingRepository;

  constructor(repository: MonitorMappingRepository) {
    this.repository = repository;
  }

  async getTeamForMonitor(monitorId: number): Promise<string | null> {
    const mapping = await this.repository.getByMonitorId(monitorId);
    return mapping ? mapping.teamId : null;
  }

  async setMonitorTeamMapping(monitorId: number, teamId: string, monitorName: string): Promise<void> {
    await this.repository.setMapping(monitorId, teamId, monitorName);
  }

  async getUnmappedMonitors(allMonitors: Monitor[]): Promise<Monitor[]> {
    const allMapped = await this.repository.getAllMapped();
    const mappedIds = new Set(allMapped.map((m) => m.monitorId));
    return allMonitors.filter((monitor) => !mappedIds.has(monitor.id));
  }

  async getMappingsForTeam(teamId: string): Promise<MonitorMapping[]> {
    return this.repository.getByTeamId(teamId);
  }
}
