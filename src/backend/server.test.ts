import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { createServer, ServerDependencies } from './server';
import { Express } from 'express';

function createMockDeps(): ServerDependencies {
  return {
    datadogPollingService: {
      isRunning: true,
      getMonitors: vi.fn().mockReturnValue([
        { id: 1, name: 'CPU Alert', state: 'OK', teamId: null, lastUpdated: new Date() },
        { id: 2, name: 'Memory Alert', state: 'Alert', teamId: 'team-1', lastUpdated: new Date() },
      ]),
      start: vi.fn(),
      stop: vi.fn(),
      onMonitorStateChange: vi.fn(),
    } as any,
    escalationEngine: {
      startEscalation: vi.fn().mockReturnValue('incident-123'),
      acknowledgeIncident: vi.fn(),
      getActiveEscalations: vi.fn().mockReturnValue([]),
      onEscalationEvent: vi.fn(),
      stopAll: vi.fn(),
    } as any,
    scheduleManager: {
      getCurrentOnCall: vi.fn().mockReturnValue({ name: 'João', contact: 'joao@example.com' }),
      getEscalationChain: vi.fn().mockReturnValue([
        { personName: 'João', position: 0 },
        { personName: 'Maria', position: 1 },
      ]),
      updateEscalationChain: vi.fn(),
    } as any,
    monitorMappingService: {
      getTeamForMonitor: vi.fn().mockReturnValue('team-1'),
      setMonitorTeamMapping: vi.fn(),
      getUnmappedMonitors: vi.fn().mockReturnValue([
        { id: 3, name: 'Unmapped Monitor', state: 'OK', teamId: null, lastUpdated: new Date() },
      ]),
      getMappingsForTeam: vi.fn().mockReturnValue([]),
    } as any,
    incidentHistoryService: {
      recordIncident: vi.fn().mockReturnValue('incident-1'),
      recordEscalation: vi.fn(),
      recordResolution: vi.fn(),
      queryHistory: vi.fn().mockReturnValue([
        {
          id: 'inc-1',
          monitorId: 1,
          monitorName: 'CPU Alert',
          teamId: 'team-1',
          onCallPerson: 'João',
          status: 'resolved',
          startedAt: new Date('2024-01-01T10:00:00Z'),
        },
      ]),
    } as any,
    csvProcessor: {
      parseAndValidate: vi.fn().mockReturnValue({
        isValid: true,
        validEntries: [
          { teamId: 'team-1', personName: 'João', date: '2024-01-01', startTime: '08:00', endTime: '16:00' },
        ],
        errors: [],
        conflicts: [],
      }),
      parseAndValidateBuffer: vi.fn().mockReturnValue({
        isValid: true,
        validEntries: [
          { teamId: 'team-1', personName: 'João', date: '2024-01-01', startTime: '08:00', endTime: '16:00' },
        ],
        errors: [],
        conflicts: [],
      }),
      importSchedule: vi.fn().mockReturnValue({
        success: true,
        importedCount: 1,
        teamId: 'team-1',
        replacedPrevious: false,
      }),
    } as any,
    teamRepository: {
      getAll: vi.fn().mockReturnValue([
        { id: 'team-1', name: 'Time Alpha', displayOrder: 1 },
        { id: 'team-2', name: 'Time Beta', displayOrder: 2 },
      ]),
      getById: vi.fn().mockImplementation((id: string) => {
        const teams: Record<string, any> = {
          'team-1': { id: 'team-1', name: 'Time Alpha', displayOrder: 1 },
          'team-2': { id: 'team-2', name: 'Time Beta', displayOrder: 2 },
        };
        return teams[id];
      }),
      exists: vi.fn().mockReturnValue(true),
    } as any,
  };
}

describe('Express Server - API Routes', () => {
  let app: Express;
  let deps: ServerDependencies;

  beforeEach(() => {
    deps = createMockDeps();
    app = createServer(deps);
  });

  describe('GET /api/status', () => {
    it('should return connected when polling service is running', async () => {
      const res = await request(app).get('/api/status');
      expect(res.status).toBe(200);
      expect(res.body.datadog).toBe('connected');
      expect(res.body.timestamp).toBeDefined();
    });

    it('should return disconnected when polling service is not running', async () => {
      (deps.datadogPollingService as any).isRunning = false;
      const res = await request(app).get('/api/status');
      expect(res.status).toBe(200);
      expect(res.body.datadog).toBe('disconnected');
    });
  });

  describe('GET /api/monitors', () => {
    it('should return list of monitors', async () => {
      const res = await request(app).get('/api/monitors');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].name).toBe('CPU Alert');
      expect(res.body[1].state).toBe('Alert');
    });
  });

  describe('GET /api/teams', () => {
    it('should return teams with current on-call person', async () => {
      const res = await request(app).get('/api/teams');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].teamId).toBe('team-1');
      expect(res.body[0].teamName).toBe('Time Alpha');
      expect(res.body[0].currentOnCall).toEqual({ name: 'João', contact: 'joao@example.com' });
      expect(res.body[0].escalationChainConfigured).toBe(true);
    });
  });

  describe('GET /api/teams/:id/escalation-chain', () => {
    it('should return escalation chain for a valid team', async () => {
      const res = await request(app).get('/api/teams/team-1/escalation-chain');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      expect(res.body[0].personName).toBe('João');
      expect(res.body[1].personName).toBe('Maria');
    });

    it('should return 404 for invalid team', async () => {
      (deps.teamRepository.getById as any).mockReturnValue(undefined);
      const res = await request(app).get('/api/teams/nonexistent/escalation-chain');
      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Time não encontrado');
    });
  });

  describe('PUT /api/teams/:id/escalation-chain', () => {
    it('should update escalation chain', async () => {
      const chain = [
        { personName: 'Carlos', position: 0 },
        { personName: 'Ana', position: 1 },
      ];
      const res = await request(app)
        .put('/api/teams/team-1/escalation-chain')
        .send(chain);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deps.scheduleManager.updateEscalationChain).toHaveBeenCalledWith('team-1', chain);
    });

    it('should return 400 when body is not an array', async () => {
      const res = await request(app)
        .put('/api/teams/team-1/escalation-chain')
        .send({ invalid: true });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/schedules/import', () => {
    it('should import a valid CSV file', async () => {
      const csvContent = 'team_id,person_name,date,start_time,end_time\nteam-1,João,2024-01-01,08:00,16:00';
      const res = await request(app)
        .post('/api/schedules/import')
        .attach('file', Buffer.from(csvContent), 'schedule.csv');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.importedCount).toBe(1);
    });

    it('should return 400 when no file is uploaded', async () => {
      const res = await request(app).post('/api/schedules/import');
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Nenhum arquivo enviado');
    });

    it('should return 422 for invalid CSV', async () => {
      (deps.csvProcessor.parseAndValidateBuffer as any).mockReturnValue({
        isValid: false,
        validEntries: [],
        errors: [{ line: 1, column: 'team_id', message: 'Colunas obrigatórias ausentes' }],
        conflicts: [],
      });
      const csvContent = 'bad_column\nvalue';
      const res = await request(app)
        .post('/api/schedules/import')
        .attach('file', Buffer.from(csvContent), 'schedule.csv');
      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.errors).toHaveLength(1);
    });
  });

  describe('GET /api/incidents', () => {
    it('should return incident history', async () => {
      const res = await request(app).get('/api/incidents');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].id).toBe('inc-1');
    });

    it('should pass query params as filters', async () => {
      await request(app).get('/api/incidents?teamId=team-1&status=active');
      expect(deps.incidentHistoryService.queryHistory).toHaveBeenCalledWith({
        teamId: 'team-1',
        status: 'active',
      });
    });
  });

  describe('POST /api/incidents/:id/acknowledge', () => {
    it('should acknowledge an incident', async () => {
      const res = await request(app)
        .post('/api/incidents/inc-1/acknowledge')
        .send({ personId: 'person-1' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deps.escalationEngine.acknowledgeIncident).toHaveBeenCalledWith('inc-1', 'person-1');
    });

    it('should return 400 when personId is missing', async () => {
      const res = await request(app)
        .post('/api/incidents/inc-1/acknowledge')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('personId é obrigatório');
    });
  });

  describe('GET /api/monitor-mappings', () => {
    it('should return mappings and unmapped monitors', async () => {
      const res = await request(app).get('/api/monitor-mappings');
      expect(res.status).toBe(200);
      expect(res.body.mappings).toBeDefined();
      expect(res.body.unmapped).toHaveLength(1);
      expect(res.body.unmapped[0].name).toBe('Unmapped Monitor');
    });
  });

  describe('PUT /api/monitor-mappings/:monitorId', () => {
    it('should associate a monitor to a team', async () => {
      const res = await request(app)
        .put('/api/monitor-mappings/42')
        .send({ teamId: 'team-1', monitorName: 'CPU Monitor' });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(deps.monitorMappingService.setMonitorTeamMapping).toHaveBeenCalledWith(
        42,
        'team-1',
        'CPU Monitor'
      );
    });

    it('should return 400 for invalid monitorId', async () => {
      const res = await request(app)
        .put('/api/monitor-mappings/abc')
        .send({ teamId: 'team-1' });
      expect(res.status).toBe(400);
    });

    it('should return 400 when teamId is missing', async () => {
      const res = await request(app)
        .put('/api/monitor-mappings/42')
        .send({});
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('teamId é obrigatório');
    });

    it('should return 404 for nonexistent team', async () => {
      (deps.teamRepository.getById as any).mockReturnValue(undefined);
      const res = await request(app)
        .put('/api/monitor-mappings/42')
        .send({ teamId: 'nonexistent' });
      expect(res.status).toBe(404);
    });
  });
});
