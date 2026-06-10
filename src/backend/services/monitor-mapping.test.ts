import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MonitorMappingService } from './monitor-mapping';
import { MonitorMappingRepository } from '../database/repositories/MonitorMappingRepository';
import { initializeDatabase } from '../database/init';
import { Monitor } from '../../shared/types';

describe('MonitorMappingService', () => {
  let db: Database.Database;
  let repository: MonitorMappingRepository;
  let service: MonitorMappingService;

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    repository = new MonitorMappingRepository(db);
    service = new MonitorMappingService(repository);
  });

  describe('getTeamForMonitor', () => {
    it('should return the teamId for a mapped monitor', () => {
      repository.setMapping(101, 'team-alpha', 'CPU High');

      const result = service.getTeamForMonitor(101);

      expect(result).toBe('team-alpha');
    });

    it('should return null for an unmapped monitor', () => {
      const result = service.getTeamForMonitor(999);

      expect(result).toBeNull();
    });

    it('should return the updated team after remapping', () => {
      repository.setMapping(101, 'team-alpha', 'CPU High');
      repository.setMapping(101, 'team-bravo', 'CPU High');

      const result = service.getTeamForMonitor(101);

      expect(result).toBe('team-bravo');
    });
  });

  describe('setMonitorTeamMapping', () => {
    it('should create a new mapping', () => {
      service.setMonitorTeamMapping(200, 'team-charlie', 'Memory Usage');

      const team = service.getTeamForMonitor(200);
      expect(team).toBe('team-charlie');
    });

    it('should update an existing mapping (ensures uniqueness)', () => {
      service.setMonitorTeamMapping(200, 'team-alpha', 'Memory Usage');
      service.setMonitorTeamMapping(200, 'team-delta', 'Memory Usage Updated');

      const team = service.getTeamForMonitor(200);
      expect(team).toBe('team-delta');

      // Should not duplicate entries
      const mappingsAlpha = service.getMappingsForTeam('team-alpha');
      expect(mappingsAlpha).toHaveLength(0);

      const mappingsDelta = service.getMappingsForTeam('team-delta');
      expect(mappingsDelta).toHaveLength(1);
      expect(mappingsDelta[0].monitorName).toBe('Memory Usage Updated');
    });

    it('should store the monitor name correctly', () => {
      service.setMonitorTeamMapping(300, 'team-echo', 'Disk Space Low');

      const mappings = service.getMappingsForTeam('team-echo');
      expect(mappings).toHaveLength(1);
      expect(mappings[0].monitorName).toBe('Disk Space Low');
      expect(mappings[0].monitorId).toBe(300);
    });
  });

  describe('getUnmappedMonitors', () => {
    const allMonitors: Monitor[] = [
      { id: 1, name: 'Monitor A', state: 'OK', teamId: null, lastUpdated: new Date() },
      { id: 2, name: 'Monitor B', state: 'Alert', teamId: null, lastUpdated: new Date() },
      { id: 3, name: 'Monitor C', state: 'Warn', teamId: null, lastUpdated: new Date() },
      { id: 4, name: 'Monitor D', state: 'OK', teamId: null, lastUpdated: new Date() },
    ];

    it('should return all monitors when none are mapped', () => {
      const result = service.getUnmappedMonitors(allMonitors);

      expect(result).toHaveLength(4);
      expect(result.map((m) => m.id)).toEqual([1, 2, 3, 4]);
    });

    it('should exclude mapped monitors', () => {
      service.setMonitorTeamMapping(1, 'team-alpha', 'Monitor A');
      service.setMonitorTeamMapping(3, 'team-bravo', 'Monitor C');

      const result = service.getUnmappedMonitors(allMonitors);

      expect(result).toHaveLength(2);
      expect(result.map((m) => m.id)).toEqual([2, 4]);
    });

    it('should return empty array when all monitors are mapped', () => {
      service.setMonitorTeamMapping(1, 'team-alpha', 'Monitor A');
      service.setMonitorTeamMapping(2, 'team-alpha', 'Monitor B');
      service.setMonitorTeamMapping(3, 'team-bravo', 'Monitor C');
      service.setMonitorTeamMapping(4, 'team-bravo', 'Monitor D');

      const result = service.getUnmappedMonitors(allMonitors);

      expect(result).toHaveLength(0);
    });

    it('should return empty array when allMonitors is empty', () => {
      const result = service.getUnmappedMonitors([]);

      expect(result).toHaveLength(0);
    });
  });

  describe('getMappingsForTeam', () => {
    it('should return all mappings for a team', () => {
      service.setMonitorTeamMapping(10, 'team-alpha', 'CPU Monitor');
      service.setMonitorTeamMapping(20, 'team-alpha', 'Memory Monitor');
      service.setMonitorTeamMapping(30, 'team-alpha', 'Disk Monitor');

      const result = service.getMappingsForTeam('team-alpha');

      expect(result).toHaveLength(3);
      const monitorIds = result.map((m) => m.monitorId).sort();
      expect(monitorIds).toEqual([10, 20, 30]);
    });

    it('should return empty array for a team with no mappings', () => {
      const result = service.getMappingsForTeam('team-foxtrot');

      expect(result).toEqual([]);
    });

    it('should not include mappings from other teams', () => {
      service.setMonitorTeamMapping(10, 'team-alpha', 'CPU Monitor');
      service.setMonitorTeamMapping(20, 'team-bravo', 'Memory Monitor');

      const resultAlpha = service.getMappingsForTeam('team-alpha');
      const resultBravo = service.getMappingsForTeam('team-bravo');

      expect(resultAlpha).toHaveLength(1);
      expect(resultAlpha[0].monitorId).toBe(10);
      expect(resultBravo).toHaveLength(1);
      expect(resultBravo[0].monitorId).toBe(20);
    });

    it('should include createdAt and updatedAt fields', () => {
      service.setMonitorTeamMapping(50, 'team-delta', 'Network Monitor');

      const result = service.getMappingsForTeam('team-delta');

      expect(result).toHaveLength(1);
      expect(result[0].createdAt).toBeDefined();
      expect(result[0].updatedAt).toBeDefined();
      expect(typeof result[0].createdAt).toBe('string');
      expect(typeof result[0].updatedAt).toBe('string');
    });
  });
});
