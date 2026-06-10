import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ScheduleManager } from './schedule-manager';
import { ScheduleRepository } from '../database/repositories/ScheduleRepository';
import { EscalationChainRepository } from '../database/repositories/EscalationChainRepository';
import { initializeDatabase } from '../database/init';
import { ScheduleEntry, EscalationChainMember } from '../../shared/types';

describe('ScheduleManager', () => {
  let db: Database.Database;
  let scheduleRepository: ScheduleRepository;
  let escalationChainRepository: EscalationChainRepository;

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    scheduleRepository = new ScheduleRepository(db);
    escalationChainRepository = new EscalationChainRepository(db);
  });

  describe('getCurrentOnCall', () => {
    it('should return the on-call person for the current time', () => {
      // Seed schedule entry covering 08:00-16:00 on 2024-01-15
      const entry: ScheduleEntry = {
        teamId: 'team-alpha',
        personName: 'Alice',
        personContact: 'alice@email.com',
        date: '2024-01-15',
        startTime: '08:00',
        endTime: '16:00',
      };
      scheduleRepository.insertOne(entry);

      // Inject a "now" at 2024-01-15 10:30
      const fakeNow = new Date(2024, 0, 15, 10, 30);
      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository,
        () => fakeNow
      );

      const result = manager.getCurrentOnCall('team-alpha');

      expect(result).toEqual({
        name: 'Alice',
        contact: 'alice@email.com',
      });
    });

    it('should return null when no schedule covers the current time', () => {
      // Seed schedule entry covering 08:00-16:00 on 2024-01-15
      const entry: ScheduleEntry = {
        teamId: 'team-alpha',
        personName: 'Alice',
        personContact: 'alice@email.com',
        date: '2024-01-15',
        startTime: '08:00',
        endTime: '16:00',
      };
      scheduleRepository.insertOne(entry);

      // Inject a "now" at 2024-01-15 18:00 (after the shift ends)
      const fakeNow = new Date(2024, 0, 15, 18, 0);
      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository,
        () => fakeNow
      );

      const result = manager.getCurrentOnCall('team-alpha');

      expect(result).toBeNull();
    });

    it('should return null when no schedule exists for the team', () => {
      const fakeNow = new Date(2024, 0, 15, 10, 0);
      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository,
        () => fakeNow
      );

      const result = manager.getCurrentOnCall('team-alpha');

      expect(result).toBeNull();
    });

    it('should return null contact when personContact is not set', () => {
      const entry: ScheduleEntry = {
        teamId: 'team-bravo',
        personName: 'Bob',
        date: '2024-02-10',
        startTime: '09:00',
        endTime: '17:00',
      };
      scheduleRepository.insertOne(entry);

      const fakeNow = new Date(2024, 1, 10, 12, 0);
      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository,
        () => fakeNow
      );

      const result = manager.getCurrentOnCall('team-bravo');

      expect(result).toEqual({
        name: 'Bob',
        contact: null,
      });
    });

    it('should return the correct person at the start time boundary', () => {
      const entry: ScheduleEntry = {
        teamId: 'team-alpha',
        personName: 'Alice',
        personContact: 'alice@email.com',
        date: '2024-01-15',
        startTime: '08:00',
        endTime: '16:00',
      };
      scheduleRepository.insertOne(entry);

      // Exactly at start time
      const fakeNow = new Date(2024, 0, 15, 8, 0);
      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository,
        () => fakeNow
      );

      const result = manager.getCurrentOnCall('team-alpha');

      expect(result).toEqual({
        name: 'Alice',
        contact: 'alice@email.com',
      });
    });

    it('should return null at the end time boundary (exclusive)', () => {
      const entry: ScheduleEntry = {
        teamId: 'team-alpha',
        personName: 'Alice',
        personContact: 'alice@email.com',
        date: '2024-01-15',
        startTime: '08:00',
        endTime: '16:00',
      };
      scheduleRepository.insertOne(entry);

      // Exactly at end time (exclusive)
      const fakeNow = new Date(2024, 0, 15, 16, 0);
      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository,
        () => fakeNow
      );

      const result = manager.getCurrentOnCall('team-alpha');

      expect(result).toBeNull();
    });
  });

  describe('getEscalationChain', () => {
    it('should return escalation chain ordered by position', () => {
      const chain: EscalationChainMember[] = [
        { personName: 'Alice', personContact: 'alice@email.com', position: 1 },
        { personName: 'Bob', personContact: 'bob@email.com', position: 2 },
        { personName: 'Carol', personContact: 'carol@email.com', position: 3 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chain);

      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository
      );

      const result = manager.getEscalationChain('team-alpha');

      expect(result).toHaveLength(3);
      expect(result[0].personName).toBe('Alice');
      expect(result[0].position).toBe(1);
      expect(result[1].personName).toBe('Bob');
      expect(result[1].position).toBe(2);
      expect(result[2].personName).toBe('Carol');
      expect(result[2].position).toBe(3);
    });

    it('should return empty array when no chain is configured', () => {
      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository
      );

      const result = manager.getEscalationChain('team-alpha');

      expect(result).toEqual([]);
    });

    it('should return chain for the correct team only', () => {
      const chainAlpha: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
      ];
      const chainBravo: EscalationChainMember[] = [
        { personName: 'Bob', position: 1 },
        { personName: 'Carol', position: 2 },
      ];
      escalationChainRepository.replaceChain('team-alpha', chainAlpha);
      escalationChainRepository.replaceChain('team-bravo', chainBravo);

      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository
      );

      const resultAlpha = manager.getEscalationChain('team-alpha');
      const resultBravo = manager.getEscalationChain('team-bravo');

      expect(resultAlpha).toHaveLength(1);
      expect(resultAlpha[0].personName).toBe('Alice');
      expect(resultBravo).toHaveLength(2);
      expect(resultBravo[0].personName).toBe('Bob');
      expect(resultBravo[1].personName).toBe('Carol');
    });
  });

  describe('updateEscalationChain', () => {
    it('should replace the existing escalation chain', () => {
      const initialChain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
        { personName: 'Bob', position: 2 },
      ];
      escalationChainRepository.replaceChain('team-alpha', initialChain);

      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository
      );

      const newChain: EscalationChainMember[] = [
        { personName: 'Carol', personContact: 'carol@email.com', position: 1 },
        { personName: 'Dave', personContact: 'dave@email.com', position: 2 },
        { personName: 'Eve', position: 3 },
      ];

      manager.updateEscalationChain('team-alpha', newChain);

      const result = manager.getEscalationChain('team-alpha');
      expect(result).toHaveLength(3);
      expect(result[0].personName).toBe('Carol');
      expect(result[0].personContact).toBe('carol@email.com');
      expect(result[1].personName).toBe('Dave');
      expect(result[2].personName).toBe('Eve');
      expect(result[2].personContact).toBeUndefined();
    });

    it('should maintain position order in the stored chain', () => {
      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository
      );

      const chain: EscalationChainMember[] = [
        { personName: 'Third', position: 3 },
        { personName: 'First', position: 1 },
        { personName: 'Second', position: 2 },
      ];

      manager.updateEscalationChain('team-alpha', chain);

      const result = manager.getEscalationChain('team-alpha');
      expect(result[0].personName).toBe('First');
      expect(result[0].position).toBe(1);
      expect(result[1].personName).toBe('Second');
      expect(result[1].position).toBe(2);
      expect(result[2].personName).toBe('Third');
      expect(result[2].position).toBe(3);
    });

    it('should not affect other teams when updating', () => {
      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository
      );

      const chainBravo: EscalationChainMember[] = [
        { personName: 'Bob', position: 1 },
      ];
      manager.updateEscalationChain('team-bravo', chainBravo);

      const chainAlpha: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
      ];
      manager.updateEscalationChain('team-alpha', chainAlpha);

      // team-bravo should still have its chain
      const resultBravo = manager.getEscalationChain('team-bravo');
      expect(resultBravo).toHaveLength(1);
      expect(resultBravo[0].personName).toBe('Bob');
    });

    it('should allow setting an empty chain', () => {
      const initialChain: EscalationChainMember[] = [
        { personName: 'Alice', position: 1 },
      ];
      escalationChainRepository.replaceChain('team-alpha', initialChain);

      const manager = new ScheduleManager(
        scheduleRepository,
        escalationChainRepository
      );

      manager.updateEscalationChain('team-alpha', []);

      const result = manager.getEscalationChain('team-alpha');
      expect(result).toEqual([]);
    });
  });
});
