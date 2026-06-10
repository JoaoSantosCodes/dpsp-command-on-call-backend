import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { CSVProcessor } from './csv-processor';
import { ScheduleRepository } from '../database/repositories/ScheduleRepository';
import { initializeDatabase } from '../database/init';
import { ScheduleEntry } from '../../shared/types';

describe('CSVProcessor', () => {
  let db: Database.Database;
  let scheduleRepository: ScheduleRepository;
  let csvProcessor: CSVProcessor;

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    scheduleRepository = new ScheduleRepository(db);
    csvProcessor = new CSVProcessor(scheduleRepository);
  });

  describe('parseAndValidate', () => {
    it('should parse a valid CSV with standard headers', () => {
      const csv = `team_id,person_name,person_contact,date,start_time,end_time
team-alpha,Alice,alice@email.com,2024-01-15,08:00,16:00
team-alpha,Bob,bob@email.com,2024-01-15,16:00,00:00`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(true);
      expect(result.validEntries).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
      expect(result.conflicts).toHaveLength(0);
      expect(result.validEntries[0]).toEqual({
        teamId: 'team-alpha',
        personName: 'Alice',
        personContact: 'alice@email.com',
        date: '2024-01-15',
        startTime: '08:00',
        endTime: '16:00',
      });
    });

    it('should parse a valid CSV with Portuguese headers', () => {
      const csv = `nome_time,nome_plantonista,contato_plantonista,data,horario_inicio,horario_fim
team-bravo,Carlos,carlos@email.com,2024-02-10,09:00,17:00`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(true);
      expect(result.validEntries).toHaveLength(1);
      expect(result.validEntries[0]).toEqual({
        teamId: 'team-bravo',
        personName: 'Carlos',
        personContact: 'carlos@email.com',
        date: '2024-02-10',
        startTime: '09:00',
        endTime: '17:00',
      });
    });

    it('should report missing required columns', () => {
      const csv = `team_id,person_name
team-alpha,Alice`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].message).toContain('Colunas obrigatórias ausentes');
      expect(result.errors[0].message).toContain('date');
      expect(result.errors[0].message).toContain('start_time');
      expect(result.errors[0].message).toContain('end_time');
    });

    it('should report errors for rows with empty required fields', () => {
      const csv = `team_id,person_name,person_contact,date,start_time,end_time
team-alpha,Alice,alice@email.com,2024-01-15,08:00,16:00
,Bob,bob@email.com,2024-01-15,16:00,00:00
team-alpha,,carol@email.com,2024-01-16,08:00,16:00`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(false);
      expect(result.validEntries).toHaveLength(1);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].line).toBe(3);
      expect(result.errors[0].column).toBe('team_id');
      expect(result.errors[1].line).toBe(4);
      expect(result.errors[1].column).toBe('person_name');
    });

    it('should report errors for invalid date format', () => {
      const csv = `team_id,person_name,person_contact,date,start_time,end_time
team-alpha,Alice,alice@email.com,15/01/2024,08:00,16:00
team-alpha,Bob,bob@email.com,2024-1-15,08:00,16:00`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].column).toBe('date');
      expect(result.errors[0].message).toContain('YYYY-MM-DD');
      expect(result.errors[1].column).toBe('date');
    });

    it('should report errors for invalid time format', () => {
      const csv = `team_id,person_name,person_contact,date,start_time,end_time
team-alpha,Alice,alice@email.com,2024-01-15,8:00,16:00
team-alpha,Bob,bob@email.com,2024-01-15,08:00,4pm`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0].column).toBe('start_time');
      expect(result.errors[0].message).toContain('HH:mm');
      expect(result.errors[1].column).toBe('end_time');
    });

    it('should detect schedule conflicts for same team and date with overlapping times', () => {
      const csv = `team_id,person_name,person_contact,date,start_time,end_time
team-alpha,Alice,alice@email.com,2024-01-15,08:00,16:00
team-alpha,Bob,bob@email.com,2024-01-15,14:00,22:00`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(false);
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0].teamId).toBe('team-alpha');
      expect(result.conflicts[0].date).toBe('2024-01-15');
      expect(result.conflicts[0].conflictingEntries).toHaveLength(2);
    });

    it('should not report conflicts for non-overlapping times on the same team and date', () => {
      const csv = `team_id,person_name,person_contact,date,start_time,end_time
team-alpha,Alice,alice@email.com,2024-01-15,08:00,16:00
team-alpha,Bob,bob@email.com,2024-01-15,16:00,00:00`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should not report conflicts for same team but different dates', () => {
      const csv = `team_id,person_name,person_contact,date,start_time,end_time
team-alpha,Alice,alice@email.com,2024-01-15,08:00,16:00
team-alpha,Bob,bob@email.com,2024-01-16,08:00,16:00`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should not report conflicts for different teams on the same date with overlapping times', () => {
      const csv = `team_id,person_name,person_contact,date,start_time,end_time
team-alpha,Alice,alice@email.com,2024-01-15,08:00,16:00
team-bravo,Bob,bob@email.com,2024-01-15,08:00,16:00`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(true);
      expect(result.conflicts).toHaveLength(0);
    });

    it('should handle person_contact as optional', () => {
      const csv = `team_id,person_name,person_contact,date,start_time,end_time
team-alpha,Alice,,2024-01-15,08:00,16:00`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(true);
      expect(result.validEntries[0].personContact).toBeUndefined();
    });

    it('should separate valid and invalid rows correctly', () => {
      const csv = `team_id,person_name,person_contact,date,start_time,end_time
team-alpha,Alice,alice@email.com,2024-01-15,08:00,16:00
team-alpha,,bob@email.com,2024-01-15,16:00,00:00
team-bravo,Carol,carol@email.com,2024-01-15,08:00,16:00
team-bravo,Dave,dave@email.com,invalid-date,08:00,16:00`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.validEntries).toHaveLength(2);
      expect(result.errors).toHaveLength(2);
      expect(result.validEntries[0].personName).toBe('Alice');
      expect(result.validEntries[1].personName).toBe('Carol');
    });

    it('should handle CSV without person_contact column', () => {
      const csv = `team_id,person_name,date,start_time,end_time
team-alpha,Alice,2024-01-15,08:00,16:00`;

      const result = csvProcessor.parseAndValidate(csv);

      expect(result.isValid).toBe(true);
      expect(result.validEntries).toHaveLength(1);
      expect(result.validEntries[0].personContact).toBeUndefined();
    });
  });

  describe('importSchedule', () => {
    it('should import entries and store them in the repository', () => {
      const entries: ScheduleEntry[] = [
        {
          teamId: 'team-alpha',
          personName: 'Alice',
          personContact: 'alice@email.com',
          date: '2024-01-15',
          startTime: '08:00',
          endTime: '16:00',
        },
        {
          teamId: 'team-alpha',
          personName: 'Bob',
          personContact: 'bob@email.com',
          date: '2024-01-15',
          startTime: '16:00',
          endTime: '00:00',
        },
      ];

      const result = csvProcessor.importSchedule(entries);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(2);
      expect(result.teamId).toBe('team-alpha');
      expect(result.replacedPrevious).toBe(false);

      const stored = scheduleRepository.getByTeam('team-alpha');
      expect(stored).toHaveLength(2);
    });

    it('should replace previous schedule for the same team', () => {
      // First import
      const firstEntries: ScheduleEntry[] = [
        {
          teamId: 'team-alpha',
          personName: 'Alice',
          date: '2024-01-15',
          startTime: '08:00',
          endTime: '16:00',
        },
      ];
      csvProcessor.importSchedule(firstEntries);

      // Second import (should replace)
      const secondEntries: ScheduleEntry[] = [
        {
          teamId: 'team-alpha',
          personName: 'Bob',
          date: '2024-01-16',
          startTime: '09:00',
          endTime: '17:00',
        },
        {
          teamId: 'team-alpha',
          personName: 'Carol',
          date: '2024-01-17',
          startTime: '10:00',
          endTime: '18:00',
        },
      ];

      const result = csvProcessor.importSchedule(secondEntries);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(2);
      expect(result.replacedPrevious).toBe(true);

      const stored = scheduleRepository.getByTeam('team-alpha');
      expect(stored).toHaveLength(2);
      expect(stored[0].personName).toBe('Bob');
      expect(stored[1].personName).toBe('Carol');
    });

    it('should handle multiple teams in a single import', () => {
      const entries: ScheduleEntry[] = [
        {
          teamId: 'team-alpha',
          personName: 'Alice',
          date: '2024-01-15',
          startTime: '08:00',
          endTime: '16:00',
        },
        {
          teamId: 'team-bravo',
          personName: 'Bob',
          date: '2024-01-15',
          startTime: '08:00',
          endTime: '16:00',
        },
      ];

      const result = csvProcessor.importSchedule(entries);

      expect(result.success).toBe(true);
      expect(result.importedCount).toBe(2);

      const alphaStored = scheduleRepository.getByTeam('team-alpha');
      const bravoStored = scheduleRepository.getByTeam('team-bravo');
      expect(alphaStored).toHaveLength(1);
      expect(bravoStored).toHaveLength(1);
    });

    it('should return failure for empty input', () => {
      const result = csvProcessor.importSchedule([]);

      expect(result.success).toBe(false);
      expect(result.importedCount).toBe(0);
    });

    it('should only replace data for the teams being imported', () => {
      // Pre-populate team-bravo
      const bravoEntries: ScheduleEntry[] = [
        {
          teamId: 'team-bravo',
          personName: 'Dave',
          date: '2024-01-15',
          startTime: '08:00',
          endTime: '16:00',
        },
      ];
      csvProcessor.importSchedule(bravoEntries);

      // Import for team-alpha only
      const alphaEntries: ScheduleEntry[] = [
        {
          teamId: 'team-alpha',
          personName: 'Alice',
          date: '2024-01-15',
          startTime: '08:00',
          endTime: '16:00',
        },
      ];
      csvProcessor.importSchedule(alphaEntries);

      // team-bravo data should still exist
      const bravoStored = scheduleRepository.getByTeam('team-bravo');
      expect(bravoStored).toHaveLength(1);
      expect(bravoStored[0].personName).toBe('Dave');
    });
  });
});
