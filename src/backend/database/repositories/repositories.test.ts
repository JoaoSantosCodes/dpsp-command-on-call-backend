import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../init';
import {
  MonitorMappingRepository,
  TeamRepository,
  ScheduleRepository,
  EscalationChainRepository,
  IncidentRepository,
} from './index';

function createTestDb(): Database.Database {
  return initializeDatabase(':memory:');
}

describe('MonitorMappingRepository', () => {
  let db: Database.Database;
  let repo: MonitorMappingRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new MonitorMappingRepository(db);
  });

  it('returns undefined for unmapped monitor', () => {
    expect(repo.getByMonitorId(999)).toBeUndefined();
  });

  it('creates and retrieves a mapping', () => {
    repo.setMapping(101, 'team-alpha', 'CPU Alert');
    const mapping = repo.getByMonitorId(101);
    expect(mapping).toBeDefined();
    expect(mapping!.monitorId).toBe(101);
    expect(mapping!.teamId).toBe('team-alpha');
    expect(mapping!.monitorName).toBe('CPU Alert');
  });

  it('upserts mapping (updates existing)', () => {
    repo.setMapping(101, 'team-alpha', 'CPU Alert');
    repo.setMapping(101, 'team-bravo', 'CPU Alert v2');
    const mapping = repo.getByMonitorId(101);
    expect(mapping!.teamId).toBe('team-bravo');
    expect(mapping!.monitorName).toBe('CPU Alert v2');
  });

  it('gets mappings by team ID', () => {
    repo.setMapping(101, 'team-alpha', 'Alert 1');
    repo.setMapping(102, 'team-alpha', 'Alert 2');
    repo.setMapping(103, 'team-bravo', 'Alert 3');

    const alphaMappings = repo.getByTeamId('team-alpha');
    expect(alphaMappings).toHaveLength(2);
    expect(alphaMappings.map(m => m.monitorId).sort()).toEqual([101, 102]);
  });

  it('gets all mapped monitors', () => {
    repo.setMapping(101, 'team-alpha', 'Alert 1');
    repo.setMapping(102, 'team-bravo', 'Alert 2');

    const all = repo.getAllMapped();
    expect(all).toHaveLength(2);
  });

  it('deletes a mapping', () => {
    repo.setMapping(101, 'team-alpha', 'Alert 1');
    repo.deleteMapping(101);
    expect(repo.getByMonitorId(101)).toBeUndefined();
  });
});

describe('TeamRepository', () => {
  let db: Database.Database;
  let repo: TeamRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new TeamRepository(db);
  });

  it('returns all seeded teams ordered by display_order', () => {
    const teams = repo.getAll();
    expect(teams).toHaveLength(11);
    expect(teams[0].id).toBe('team-alpha');
    expect(teams[10].id).toBe('team-kilo');
    // Verify ordering
    for (let i = 1; i < teams.length; i++) {
      expect(teams[i].displayOrder).toBeGreaterThan(teams[i - 1].displayOrder);
    }
  });

  it('gets a team by ID', () => {
    const team = repo.getById('team-bravo');
    expect(team).toBeDefined();
    expect(team!.name).toBe('Time Bravo');
    expect(team!.displayOrder).toBe(2);
  });

  it('returns undefined for non-existent team', () => {
    expect(repo.getById('non-existent')).toBeUndefined();
  });

  it('checks if a team exists', () => {
    expect(repo.exists('team-alpha')).toBe(true);
    expect(repo.exists('team-fake')).toBe(false);
  });
});

describe('ScheduleRepository', () => {
  let db: Database.Database;
  let repo: ScheduleRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new ScheduleRepository(db);
  });

  it('inserts and retrieves schedule entries for a team', () => {
    repo.insertOne({
      teamId: 'team-alpha',
      personName: 'Alice',
      personContact: 'alice@email.com',
      date: '2024-01-15',
      startTime: '08:00',
      endTime: '16:00',
    });

    const entries = repo.getByTeam('team-alpha');
    expect(entries).toHaveLength(1);
    expect(entries[0].personName).toBe('Alice');
    expect(entries[0].personContact).toBe('alice@email.com');
  });

  it('finds schedule entry covering a specific time', () => {
    repo.insertOne({
      teamId: 'team-alpha',
      personName: 'Alice',
      date: '2024-01-15',
      startTime: '08:00',
      endTime: '16:00',
    });

    const found = repo.getByTeamAndDateTime('team-alpha', '2024-01-15', '10:00');
    expect(found).toBeDefined();
    expect(found!.personName).toBe('Alice');

    // Not covered
    const notFound = repo.getByTeamAndDateTime('team-alpha', '2024-01-15', '17:00');
    expect(notFound).toBeUndefined();
  });

  it('does not find entry at exact end time (exclusive)', () => {
    repo.insertOne({
      teamId: 'team-alpha',
      personName: 'Alice',
      date: '2024-01-15',
      startTime: '08:00',
      endTime: '16:00',
    });

    const atEnd = repo.getByTeamAndDateTime('team-alpha', '2024-01-15', '16:00');
    expect(atEnd).toBeUndefined();
  });

  it('inserts many entries in a transaction', () => {
    const entries = [
      { teamId: 'team-alpha', personName: 'Alice', date: '2024-01-15', startTime: '08:00', endTime: '16:00' },
      { teamId: 'team-alpha', personName: 'Bob', date: '2024-01-15', startTime: '16:00', endTime: '00:00' },
      { teamId: 'team-alpha', personName: 'Charlie', date: '2024-01-16', startTime: '08:00', endTime: '16:00' },
    ];

    repo.insertMany(entries);
    const result = repo.getByTeam('team-alpha');
    expect(result).toHaveLength(3);
  });

  it('deletes all entries for a team', () => {
    repo.insertOne({ teamId: 'team-alpha', personName: 'Alice', date: '2024-01-15', startTime: '08:00', endTime: '16:00' });
    repo.insertOne({ teamId: 'team-bravo', personName: 'Bob', date: '2024-01-15', startTime: '08:00', endTime: '16:00' });

    repo.deleteByTeam('team-alpha');
    expect(repo.getByTeam('team-alpha')).toHaveLength(0);
    expect(repo.getByTeam('team-bravo')).toHaveLength(1);
  });
});

describe('EscalationChainRepository', () => {
  let db: Database.Database;
  let repo: EscalationChainRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new EscalationChainRepository(db);
  });

  it('returns empty array for team with no chain', () => {
    expect(repo.getByTeam('team-alpha')).toEqual([]);
  });

  it('replaces chain atomically', () => {
    const chain = [
      { personName: 'Alice', personContact: 'alice@email.com', position: 1 },
      { personName: 'Bob', personContact: 'bob@email.com', position: 2 },
      { personName: 'Charlie', position: 3 },
    ];

    repo.replaceChain('team-alpha', chain);
    const result = repo.getByTeam('team-alpha');
    expect(result).toHaveLength(3);
    expect(result[0].personName).toBe('Alice');
    expect(result[1].personName).toBe('Bob');
    expect(result[2].personName).toBe('Charlie');
    expect(result[2].personContact).toBeUndefined();
  });

  it('replaces existing chain with new one', () => {
    repo.replaceChain('team-alpha', [
      { personName: 'Alice', position: 1 },
      { personName: 'Bob', position: 2 },
    ]);

    repo.replaceChain('team-alpha', [
      { personName: 'Dave', position: 1 },
      { personName: 'Eve', position: 2 },
      { personName: 'Frank', position: 3 },
    ]);

    const result = repo.getByTeam('team-alpha');
    expect(result).toHaveLength(3);
    expect(result[0].personName).toBe('Dave');
  });

  it('deletes chain for a team', () => {
    repo.replaceChain('team-alpha', [{ personName: 'Alice', position: 1 }]);
    repo.deleteByTeam('team-alpha');
    expect(repo.getByTeam('team-alpha')).toEqual([]);
  });

  it('does not affect other teams when replacing', () => {
    repo.replaceChain('team-alpha', [{ personName: 'Alice', position: 1 }]);
    repo.replaceChain('team-bravo', [{ personName: 'Bob', position: 1 }]);

    repo.replaceChain('team-alpha', [{ personName: 'Charlie', position: 1 }]);

    expect(repo.getByTeam('team-bravo')[0].personName).toBe('Bob');
  });
});

describe('IncidentRepository', () => {
  let db: Database.Database;
  let repo: IncidentRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new IncidentRepository(db);
  });

  it('creates and retrieves an incident', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    repo.create({
      id: 'inc-001',
      monitorId: 101,
      monitorName: 'CPU Alert',
      teamId: 'team-alpha',
      onCallPerson: 'Alice',
      status: 'active',
      startedAt: now,
    });

    const incident = repo.getById('inc-001');
    expect(incident).toBeDefined();
    expect(incident!.id).toBe('inc-001');
    expect(incident!.monitorId).toBe(101);
    expect(incident!.teamId).toBe('team-alpha');
    expect(incident!.onCallPerson).toBe('Alice');
    expect(incident!.status).toBe('active');
    expect(incident!.startedAt.toISOString()).toBe(now.toISOString());
    expect(incident!.acknowledgedAt).toBeUndefined();
    expect(incident!.resolvedAt).toBeUndefined();
  });

  it('returns undefined for non-existent incident', () => {
    expect(repo.getById('non-existent')).toBeUndefined();
  });

  it('gets active incidents', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    repo.create({ id: 'inc-001', monitorId: 101, monitorName: 'Alert 1', teamId: 'team-alpha', onCallPerson: 'Alice', status: 'active', startedAt: now });
    repo.create({ id: 'inc-002', monitorId: 102, monitorName: 'Alert 2', teamId: 'team-bravo', onCallPerson: 'Bob', status: 'acknowledged', startedAt: now });
    repo.create({ id: 'inc-003', monitorId: 103, monitorName: 'Alert 3', teamId: 'team-charlie', onCallPerson: 'Charlie', status: 'resolved', startedAt: now });

    const active = repo.getActive();
    expect(active).toHaveLength(2);
    expect(active.map(i => i.id).sort()).toEqual(['inc-001', 'inc-002']);
  });

  it('acknowledges an incident', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    const ackTime = new Date('2024-01-15T10:05:00Z');
    repo.create({ id: 'inc-001', monitorId: 101, monitorName: 'Alert 1', teamId: 'team-alpha', onCallPerson: 'Alice', status: 'active', startedAt: now });

    repo.acknowledge('inc-001', 'Alice', ackTime);

    const incident = repo.getById('inc-001');
    expect(incident!.status).toBe('acknowledged');
    expect(incident!.acknowledgedBy).toBe('Alice');
    expect(incident!.acknowledgedAt!.toISOString()).toBe(ackTime.toISOString());
  });

  it('resolves an incident', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    const resolveTime = new Date('2024-01-15T10:30:00Z');
    repo.create({ id: 'inc-001', monitorId: 101, monitorName: 'Alert 1', teamId: 'team-alpha', onCallPerson: 'Alice', status: 'active', startedAt: now });

    repo.resolve('inc-001', 'Alice', resolveTime);

    const incident = repo.getById('inc-001');
    expect(incident!.status).toBe('resolved');
    expect(incident!.resolvedBy).toBe('Alice');
    expect(incident!.resolvedAt!.toISOString()).toBe(resolveTime.toISOString());
  });

  it('updates status', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    repo.create({ id: 'inc-001', monitorId: 101, monitorName: 'Alert 1', teamId: 'team-alpha', onCallPerson: 'Alice', status: 'active', startedAt: now });

    repo.updateStatus('inc-001', 'escalation_exhausted');

    const incident = repo.getById('inc-001');
    expect(incident!.status).toBe('escalation_exhausted');
  });

  it('queries with filters', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    repo.create({ id: 'inc-001', monitorId: 101, monitorName: 'Alert 1', teamId: 'team-alpha', onCallPerson: 'Alice', status: 'active', startedAt: now });
    repo.create({ id: 'inc-002', monitorId: 102, monitorName: 'Alert 2', teamId: 'team-bravo', onCallPerson: 'Bob', status: 'resolved', startedAt: new Date('2024-01-16T10:00:00Z') });
    repo.create({ id: 'inc-003', monitorId: 103, monitorName: 'Alert 3', teamId: 'team-alpha', onCallPerson: 'Alice', status: 'resolved', startedAt: new Date('2024-01-17T10:00:00Z') });

    // Filter by team
    const alphaIncidents = repo.query({ teamId: 'team-alpha' });
    expect(alphaIncidents).toHaveLength(2);

    // Filter by status
    const resolved = repo.query({ status: 'resolved' });
    expect(resolved).toHaveLength(2);

    // Filter by team + status
    const alphaResolved = repo.query({ teamId: 'team-alpha', status: 'resolved' });
    expect(alphaResolved).toHaveLength(1);
    expect(alphaResolved[0].id).toBe('inc-003');

    // No filters returns all
    const all = repo.query({});
    expect(all).toHaveLength(3);
  });

  it('creates and retrieves escalation events', () => {
    const now = new Date('2024-01-15T10:00:00Z');
    repo.create({ id: 'inc-001', monitorId: 101, monitorName: 'Alert 1', teamId: 'team-alpha', onCallPerson: 'Alice', status: 'active', startedAt: now });

    repo.createEscalationEvent({
      incidentId: 'inc-001',
      fromPerson: 'Alice',
      toPerson: 'Bob',
      escalationLevel: 1,
    });

    repo.createEscalationEvent({
      incidentId: 'inc-001',
      fromPerson: 'Bob',
      toPerson: 'Charlie',
      escalationLevel: 2,
    });

    const events = repo.getEscalationEvents('inc-001');
    expect(events).toHaveLength(2);
    expect(events[0].fromPerson).toBe('Alice');
    expect(events[0].toPerson).toBe('Bob');
    expect(events[0].escalationLevel).toBe(1);
    expect(events[1].escalationLevel).toBe(2);
    expect(events[0].createdAt).toBeInstanceOf(Date);
  });
});
