import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { IncidentHistoryService } from './incident-history';
import { IncidentRepository } from '../database/repositories/IncidentRepository';
import { initializeDatabase } from '../database/init';
import { IncidentRecord, EscalationRecord, ResolutionRecord } from '../../shared/types';

describe('IncidentHistoryService', () => {
  let db: Database.Database;
  let repository: IncidentRepository;
  let service: IncidentHistoryService;

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    repository = new IncidentRepository(db);
    service = new IncidentHistoryService(repository);
  });

  describe('recordIncident', () => {
    it('should record an incident and return its id', () => {
      const incident: IncidentRecord = {
        id: 'inc-001',
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
        onCallPerson: 'Alice',
        status: 'active',
        startedAt: new Date('2024-01-15T10:00:00Z'),
      };

      const id = service.recordIncident(incident);

      expect(id).toBe('inc-001');
    });

    it('should generate a UUID if id is not provided', () => {
      const incident: IncidentRecord = {
        id: '',
        monitorId: 102,
        monitorName: 'Memory Usage',
        teamId: 'team-bravo',
        onCallPerson: 'Bob',
        status: 'active',
        startedAt: new Date('2024-01-15T11:00:00Z'),
      };

      const id = service.recordIncident(incident);

      expect(id).toBeDefined();
      expect(id).not.toBe('');
      // UUID v4 format
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should persist the incident in the database', () => {
      const incident: IncidentRecord = {
        id: 'inc-002',
        monitorId: 103,
        monitorName: 'Disk Space Low',
        teamId: 'team-charlie',
        onCallPerson: 'Charlie',
        status: 'active',
        startedAt: new Date('2024-01-15T12:00:00Z'),
      };

      service.recordIncident(incident);

      const stored = repository.getById('inc-002');
      expect(stored).toBeDefined();
      expect(stored!.monitorId).toBe(103);
      expect(stored!.monitorName).toBe('Disk Space Low');
      expect(stored!.teamId).toBe('team-charlie');
      expect(stored!.onCallPerson).toBe('Charlie');
      expect(stored!.status).toBe('active');
    });

    it('should store all mandatory fields correctly', () => {
      const incident: IncidentRecord = {
        id: 'inc-003',
        monitorId: 200,
        monitorName: 'Network Latency',
        teamId: 'team-delta',
        onCallPerson: 'Diana',
        status: 'active',
        startedAt: new Date('2024-02-01T08:30:00Z'),
      };

      service.recordIncident(incident);

      const stored = repository.getById('inc-003');
      expect(stored).toBeDefined();
      expect(stored!.id).toBe('inc-003');
      expect(stored!.monitorId).toBe(200);
      expect(stored!.monitorName).toBe('Network Latency');
      expect(stored!.teamId).toBe('team-delta');
      expect(stored!.onCallPerson).toBe('Diana');
      expect(stored!.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('recordEscalation', () => {
    it('should record an escalation event for an incident', () => {
      const incident: IncidentRecord = {
        id: 'inc-esc-001',
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
        onCallPerson: 'Alice',
        status: 'active',
        startedAt: new Date('2024-01-15T10:00:00Z'),
      };
      service.recordIncident(incident);

      const escalation: EscalationRecord = {
        fromPerson: 'Alice',
        toPerson: 'Bob',
        escalationLevel: 1,
        createdAt: new Date('2024-01-15T10:15:00Z'),
      };

      service.recordEscalation('inc-esc-001', escalation);

      const events = repository.getEscalationEvents('inc-esc-001');
      expect(events).toHaveLength(1);
      expect(events[0].incidentId).toBe('inc-esc-001');
      expect(events[0].fromPerson).toBe('Alice');
      expect(events[0].toPerson).toBe('Bob');
      expect(events[0].escalationLevel).toBe(1);
    });

    it('should record multiple escalation events in sequence', () => {
      const incident: IncidentRecord = {
        id: 'inc-esc-002',
        monitorId: 102,
        monitorName: 'Memory Usage',
        teamId: 'team-bravo',
        onCallPerson: 'Alice',
        status: 'active',
        startedAt: new Date('2024-01-15T10:00:00Z'),
      };
      service.recordIncident(incident);

      service.recordEscalation('inc-esc-002', {
        fromPerson: 'Alice',
        toPerson: 'Bob',
        escalationLevel: 1,
        createdAt: new Date('2024-01-15T10:15:00Z'),
      });

      service.recordEscalation('inc-esc-002', {
        fromPerson: 'Bob',
        toPerson: 'Charlie',
        escalationLevel: 2,
        createdAt: new Date('2024-01-15T10:30:00Z'),
      });

      const events = repository.getEscalationEvents('inc-esc-002');
      expect(events).toHaveLength(2);
      expect(events[0].escalationLevel).toBe(1);
      expect(events[1].escalationLevel).toBe(2);
    });
  });

  describe('recordResolution', () => {
    it('should update an incident with resolution details', () => {
      const incident: IncidentRecord = {
        id: 'inc-res-001',
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
        onCallPerson: 'Alice',
        status: 'active',
        startedAt: new Date('2024-01-15T10:00:00Z'),
      };
      service.recordIncident(incident);

      const resolution: ResolutionRecord = {
        resolvedBy: 'Alice',
        resolvedAt: new Date('2024-01-15T10:30:00Z'),
      };

      service.recordResolution('inc-res-001', resolution);

      const stored = repository.getById('inc-res-001');
      expect(stored).toBeDefined();
      expect(stored!.status).toBe('resolved');
      expect(stored!.resolvedBy).toBe('Alice');
      expect(stored!.resolvedAt).toBeInstanceOf(Date);
    });

    it('should mark the incident as resolved', () => {
      const incident: IncidentRecord = {
        id: 'inc-res-002',
        monitorId: 102,
        monitorName: 'Memory Usage',
        teamId: 'team-bravo',
        onCallPerson: 'Bob',
        status: 'active',
        startedAt: new Date('2024-01-15T11:00:00Z'),
      };
      service.recordIncident(incident);

      service.recordResolution('inc-res-002', {
        resolvedBy: 'Bob',
        resolvedAt: new Date('2024-01-15T11:45:00Z'),
      });

      const stored = repository.getById('inc-res-002');
      expect(stored!.status).toBe('resolved');
    });
  });

  describe('queryHistory', () => {
    beforeEach(() => {
      // Seed multiple incidents for filter testing
      const incidents: IncidentRecord[] = [
        {
          id: 'q-001',
          monitorId: 101,
          monitorName: 'CPU High',
          teamId: 'team-alpha',
          onCallPerson: 'Alice',
          status: 'active',
          startedAt: new Date('2024-01-10T10:00:00Z'),
        },
        {
          id: 'q-002',
          monitorId: 102,
          monitorName: 'Memory Usage',
          teamId: 'team-bravo',
          onCallPerson: 'Bob',
          status: 'active',
          startedAt: new Date('2024-01-15T10:00:00Z'),
        },
        {
          id: 'q-003',
          monitorId: 103,
          monitorName: 'Disk Space',
          teamId: 'team-alpha',
          onCallPerson: 'Alice',
          status: 'active',
          startedAt: new Date('2024-01-20T10:00:00Z'),
        },
      ];

      for (const inc of incidents) {
        service.recordIncident(inc);
      }

      // Resolve one incident
      service.recordResolution('q-001', {
        resolvedBy: 'Alice',
        resolvedAt: new Date('2024-01-10T11:00:00Z'),
      });
    });

    it('should return all incidents when no filters are applied', () => {
      const results = service.queryHistory({});

      expect(results).toHaveLength(3);
    });

    it('should filter by teamId', () => {
      const results = service.queryHistory({ teamId: 'team-alpha' });

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.teamId === 'team-alpha')).toBe(true);
    });

    it('should filter by status', () => {
      const results = service.queryHistory({ status: 'resolved' });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('q-001');
      expect(results[0].status).toBe('resolved');
    });

    it('should filter by startDate', () => {
      const results = service.queryHistory({ startDate: '2024-01-14T00:00:00Z' });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id);
      expect(ids).toContain('q-002');
      expect(ids).toContain('q-003');
    });

    it('should filter by endDate', () => {
      const results = service.queryHistory({ endDate: '2024-01-16T00:00:00Z' });

      expect(results).toHaveLength(2);
      const ids = results.map((r) => r.id);
      expect(ids).toContain('q-001');
      expect(ids).toContain('q-002');
    });

    it('should combine multiple filters', () => {
      const results = service.queryHistory({
        teamId: 'team-alpha',
        status: 'active',
      });

      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('q-003');
    });

    it('should return empty array when no incidents match', () => {
      const results = service.queryHistory({ teamId: 'team-nonexistent' });

      expect(results).toHaveLength(0);
    });

    it('should return results ordered by startedAt descending', () => {
      const results = service.queryHistory({});

      expect(results[0].id).toBe('q-003');
      expect(results[1].id).toBe('q-002');
      expect(results[2].id).toBe('q-001');
    });
  });
});
