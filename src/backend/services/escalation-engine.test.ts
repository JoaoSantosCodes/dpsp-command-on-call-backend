import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { EscalationEngine } from './escalation-engine';
import { IncidentRepository } from '../database/repositories/IncidentRepository';
import { EscalationChainRepository } from '../database/repositories/EscalationChainRepository';
import { ScheduleRepository } from '../database/repositories/ScheduleRepository';
import { ScheduleManager } from './schedule-manager';
import { initializeDatabase } from '../database/init';
import { EscalationChainMember, ScheduleEntry, EscalationEvent } from '../../shared/types';

describe('EscalationEngine', () => {
  let db: Database.Database;
  let incidentRepository: IncidentRepository;
  let escalationChainRepository: EscalationChainRepository;
  let scheduleRepository: ScheduleRepository;
  let scheduleManager: ScheduleManager;
  let engine: EscalationEngine;

  const FIFTEEN_MINUTES = 15 * 60 * 1000;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 15, 10, 0, 0));

    db = initializeDatabase(':memory:');
    incidentRepository = new IncidentRepository(db);
    escalationChainRepository = new EscalationChainRepository(db);
    scheduleRepository = new ScheduleRepository(db);
    scheduleManager = new ScheduleManager(
      scheduleRepository,
      escalationChainRepository,
      () => new Date()
    );
    engine = new EscalationEngine(
      incidentRepository,
      escalationChainRepository,
      scheduleManager
    );

    // Set up a schedule so getCurrentOnCall resolves a person
    const entry: ScheduleEntry = {
      teamId: 'team-alpha',
      personName: 'Alice',
      personContact: 'alice@email.com',
      date: '2024-01-15',
      startTime: '08:00',
      endTime: '18:00',
    };
    scheduleRepository.insertOne(entry);
  });

  afterEach(() => {
    engine.stopAll();
    vi.useRealTimers();
  });

  describe('startEscalation', () => {
    it('should create an incident record and start a 15-minute timer', () => {
      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      const incidentId = engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      expect(incidentId).toBeDefined();

      const incident = incidentRepository.getById(incidentId);
      expect(incident).toBeDefined();
      expect(incident!.status).toBe('active');
      expect(incident!.monitorId).toBe(101);
      expect(incident!.monitorName).toBe('CPU High');
      expect(incident!.teamId).toBe('team-alpha');
      expect(incident!.onCallPerson).toBe('Alice');
    });

    it('should resolve the on-call person from ScheduleManager', () => {
      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      const incidentId = engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      const incident = incidentRepository.getById(incidentId);
      expect(incident!.onCallPerson).toBe('Alice');
    });

    it('should use "unknown" when no on-call person is available', () => {
      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
      ];
      escalationChainRepository.replaceChain('team-bravo', chain);

      const incidentId = engine.startEscalation({
        monitorId: 102,
        monitorName: 'Disk Full',
        teamId: 'team-bravo', // no schedule set up for team-bravo
      });

      const incident = incidentRepository.getById(incidentId);
      expect(incident!.onCallPerson).toBe('unknown');
    });

    it('should mark incident as escalation_exhausted if chain is empty', () => {
      // No chain configured for team-alpha
      escalationChainRepository.replaceChain('team-alpha', []);

      const incidentId = engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      const incident = incidentRepository.getById(incidentId);
      expect(incident!.status).toBe('escalation_exhausted');
    });
  });

  describe('acknowledgeIncident', () => {
    it('should cancel the escalation timer and record acknowledgment', () => {
      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      const incidentId = engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      // Advance 5 minutes (not enough to trigger escalation)
      vi.advanceTimersByTime(5 * 60 * 1000);

      engine.acknowledgeIncident(incidentId, 'Alice');

      const incident = incidentRepository.getById(incidentId);
      expect(incident!.status).toBe('acknowledged');
      expect(incident!.acknowledgedBy).toBe('Alice');
      expect(incident!.acknowledgedAt).toBeDefined();
    });

    it('should prevent further escalation after acknowledgment', () => {
      const events: EscalationEvent[] = [];
      engine.onEscalationEvent((event) => events.push(event));

      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      const incidentId = engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      // Acknowledge after 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);
      engine.acknowledgeIncident(incidentId, 'Alice');

      // Advance past the 15-minute mark
      vi.advanceTimersByTime(15 * 60 * 1000);

      // No escalation events should have been emitted
      expect(events).toHaveLength(0);
    });

    it('should handle acknowledgment even if no timer is active', () => {
      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      const incidentId = engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      // Exhaust the chain first
      vi.advanceTimersByTime(FIFTEEN_MINUTES);

      // Now acknowledge (no timer should be active)
      engine.acknowledgeIncident(incidentId, 'Alice');

      const incident = incidentRepository.getById(incidentId);
      expect(incident!.acknowledgedBy).toBe('Alice');
    });
  });

  describe('escalation progression', () => {
    it('should escalate to the next member after 15 minutes', () => {
      const events: EscalationEvent[] = [];
      engine.onEscalationEvent((event) => events.push(event));

      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
        { personName: 'Carol', position: 3 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      // Advance 15 minutes → should escalate from Alice to Bob
      vi.advanceTimersByTime(FIFTEEN_MINUTES);

      expect(events).toHaveLength(1);
      expect(events[0].fromPerson).toBe('Alice');
      expect(events[0].toPerson).toBe('Bob');
      expect(events[0].escalationLevel).toBe(1);
    });

    it('should escalate through the entire chain', () => {
      const events: EscalationEvent[] = [];
      engine.onEscalationEvent((event) => events.push(event));

      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
        { personName: 'Carol', position: 3 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      const incidentId = engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      // First escalation: Alice → Bob
      vi.advanceTimersByTime(FIFTEEN_MINUTES);
      expect(events).toHaveLength(1);
      expect(events[0].fromPerson).toBe('Alice');
      expect(events[0].toPerson).toBe('Bob');

      // Second escalation: Bob → Carol
      vi.advanceTimersByTime(FIFTEEN_MINUTES);
      expect(events).toHaveLength(2);
      expect(events[1].fromPerson).toBe('Bob');
      expect(events[1].toPerson).toBe('Carol');

      // Chain exhausted: Carol → none
      vi.advanceTimersByTime(FIFTEEN_MINUTES);
      expect(events).toHaveLength(3);
      expect(events[2].fromPerson).toBe('Carol');
      expect(events[2].toPerson).toBe('none');
      expect(events[2].escalationLevel).toBe(3);

      const incident = incidentRepository.getById(incidentId);
      expect(incident!.status).toBe('escalation_exhausted');
    });

    it('should record escalation events in the database', () => {
      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      const incidentId = engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      // Trigger escalation
      vi.advanceTimersByTime(FIFTEEN_MINUTES);

      const dbEvents = incidentRepository.getEscalationEvents(incidentId);
      expect(dbEvents).toHaveLength(1);
      expect(dbEvents[0].incidentId).toBe(incidentId);
      expect(dbEvents[0].fromPerson).toBe('Alice');
      expect(dbEvents[0].toPerson).toBe('Bob');
      expect(dbEvents[0].escalationLevel).toBe(1);
    });

    it('should set escalation_exhausted when chain runs out', () => {
      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      const incidentId = engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      // After 15 minutes, Alice's window expires and chain is exhausted
      vi.advanceTimersByTime(FIFTEEN_MINUTES);

      const incident = incidentRepository.getById(incidentId);
      expect(incident!.status).toBe('escalation_exhausted');
    });
  });

  describe('getActiveEscalations', () => {
    it('should return active escalations with timer info', () => {
      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      // Advance 5 minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      const escalations = engine.getActiveEscalations();
      expect(escalations).toHaveLength(1);
      expect(escalations[0].monitorId).toBe(101);
      expect(escalations[0].monitorName).toBe('CPU High');
      expect(escalations[0].teamId).toBe('team-alpha');
      expect(escalations[0].onCallPerson).toBe('Alice');
      expect(escalations[0].currentEscalationLevel).toBe(0);
      // Should have ~10 minutes remaining (600 seconds)
      expect(escalations[0].timeUntilNextEscalation).toBe(600);
    });

    it('should return empty array when no active escalations', () => {
      const escalations = engine.getActiveEscalations();
      expect(escalations).toEqual([]);
    });

    it('should not include acknowledged incidents', () => {
      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      const incidentId = engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      engine.acknowledgeIncident(incidentId, 'Alice');

      const escalations = engine.getActiveEscalations();
      expect(escalations).toHaveLength(0);
    });

    it('should track escalation level after progression', () => {
      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
        { personName: 'Carol', position: 3 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      // Advance 15 minutes → escalate to Bob (level 1)
      vi.advanceTimersByTime(FIFTEEN_MINUTES);

      // Advance 5 more minutes
      vi.advanceTimersByTime(5 * 60 * 1000);

      const escalations = engine.getActiveEscalations();
      expect(escalations).toHaveLength(1);
      expect(escalations[0].currentEscalationLevel).toBe(1);
      expect(escalations[0].timeUntilNextEscalation).toBe(600);
    });
  });

  describe('onEscalationEvent', () => {
    it('should emit events to registered callbacks', () => {
      const events: EscalationEvent[] = [];
      engine.onEscalationEvent((event) => events.push(event));

      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      vi.advanceTimersByTime(FIFTEEN_MINUTES);

      expect(events).toHaveLength(1);
      expect(events[0].incidentId).toBeDefined();
      expect(events[0].fromPerson).toBe('Alice');
      expect(events[0].toPerson).toBe('Bob');
      expect(events[0].escalationLevel).toBe(1);
      expect(events[0].createdAt).toBeInstanceOf(Date);
    });

    it('should support multiple callbacks', () => {
      let callCount = 0;
      engine.onEscalationEvent(() => callCount++);
      engine.onEscalationEvent(() => callCount++);

      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      vi.advanceTimersByTime(FIFTEEN_MINUTES);

      expect(callCount).toBe(2);
    });
  });

  describe('stopAll', () => {
    it('should cancel all active timers', () => {
      const events: EscalationEvent[] = [];
      engine.onEscalationEvent((event) => events.push(event));

      const chain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      engine.startEscalation({
        monitorId: 101,
        monitorName: 'CPU High',
        teamId: 'team-alpha',
      });

      engine.stopAll();

      // Advance past the timeout - no escalation should fire
      vi.advanceTimersByTime(FIFTEEN_MINUTES * 2);

      expect(events).toHaveLength(0);
    });
  });
});
