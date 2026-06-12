import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { CSVProcessor, detectAndDecodeBuffer, isValidUtf8String } from './csv-processor';
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

describe('detectAndDecodeBuffer', () => {
  it('should decode plain UTF-8 content correctly', () => {
    const content = 'team_id,person_name,date,start_time,end_time\nTorre Soluções de Saúde,João,2024-01-15,08:00,16:00';
    const buffer = Buffer.from(content, 'utf-8');

    const result = detectAndDecodeBuffer(buffer);

    expect(result).toBe(content);
    expect(result).toContain('Soluções');
    expect(result).toContain('Saúde');
    expect(result).toContain('João');
  });

  it('should decode UTF-8 with BOM by stripping the BOM', () => {
    const content = 'team_id,person_name,date,start_time,end_time\nTorre Soluções de Saúde,João,2024-01-15,08:00,16:00';
    // UTF-8 BOM: 0xEF 0xBB 0xBF
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const contentBuffer = Buffer.from(content, 'utf-8');
    const buffer = Buffer.concat([bom, contentBuffer]);

    const result = detectAndDecodeBuffer(buffer);

    expect(result).toBe(content);
    expect(result).not.toContain('\uFEFF'); // BOM character should be stripped
    expect(result).toContain('Soluções');
    expect(result).toContain('Saúde');
  });

  it('should decode latin1/Windows-1252 encoded content with Portuguese characters', () => {
    // In latin1: ã = 0xE3, õ = 0xF5, ú = 0xFA, ç = 0xE7, é = 0xE9, á = 0xE1
    // "Soluções de Saúde" in latin1
    const latin1Content = 'team_id,person_name\nTorre Solu\xE7\xF5es de Sa\xFAde,Jo\xE3o';
    const buffer = Buffer.from(latin1Content, 'latin1');

    const result = detectAndDecodeBuffer(buffer);

    expect(result).toContain('Soluções');
    expect(result).toContain('Saúde');
    expect(result).toContain('João');
    expect(isValidUtf8String(result)).toBe(true);
  });

  it('should handle empty buffer', () => {
    const buffer = Buffer.from('');

    const result = detectAndDecodeBuffer(buffer);

    expect(result).toBe('');
  });

  it('should handle ASCII-only content (no encoding ambiguity)', () => {
    const content = 'team_id,person_name\nteam-alpha,Alice';
    const buffer = Buffer.from(content, 'utf-8');

    const result = detectAndDecodeBuffer(buffer);

    expect(result).toBe(content);
  });

  it('should correctly decode latin1 content with multiple accented characters', () => {
    // "Operação" has ã (0xE3) and ç (0xE7)
    // "Logística" has í (0xED)
    const latin1Content = 'Opera\xE7\xE3o,Log\xEDstica,Preven\xE7\xE3o';
    const buffer = Buffer.from(latin1Content, 'latin1');

    const result = detectAndDecodeBuffer(buffer);

    expect(result).toContain('Operação');
    expect(result).toContain('Logística');
    expect(result).toContain('Prevenção');
  });
});

describe('isValidUtf8String', () => {
  it('should return true for valid UTF-8 strings with accented characters', () => {
    expect(isValidUtf8String('Torre Soluções de Saúde')).toBe(true);
    expect(isValidUtf8String('Operação')).toBe(true);
    expect(isValidUtf8String('João')).toBe(true);
  });

  it('should return false for strings containing replacement character U+FFFD', () => {
    expect(isValidUtf8String('Torre Solu\uFFFDes de Sa\uFFFDde')).toBe(false);
  });

  it('should return false for strings containing the visual garbled character', () => {
    expect(isValidUtf8String('TORRE SOLU��ES DE SA�DE')).toBe(false);
  });

  it('should return true for empty string', () => {
    expect(isValidUtf8String('')).toBe(true);
  });

  it('should return true for plain ASCII', () => {
    expect(isValidUtf8String('Hello World')).toBe(true);
  });
});

describe('CSVProcessor - parseAndValidateBuffer', () => {
  let db: Database.Database;
  let scheduleRepository: ScheduleRepository;
  let csvProcessor: CSVProcessor;

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    scheduleRepository = new ScheduleRepository(db);
    csvProcessor = new CSVProcessor(scheduleRepository);
  });

  it('should parse a UTF-8 encoded CSV buffer with Portuguese characters', () => {
    const csv = 'team_id,person_name,person_contact,date,start_time,end_time\nTorre Soluções,João,joao@email.com,2024-01-15,08:00,16:00';
    const buffer = Buffer.from(csv, 'utf-8');

    const result = csvProcessor.parseAndValidateBuffer(buffer);

    expect(result.isValid).toBe(true);
    expect(result.validEntries).toHaveLength(1);
    expect(result.validEntries[0].teamId).toBe('Torre Soluções');
    expect(result.validEntries[0].personName).toBe('João');
  });

  it('should parse a UTF-8 BOM encoded CSV buffer', () => {
    const csv = 'team_id,person_name,person_contact,date,start_time,end_time\nTorre Soluções,João,joao@email.com,2024-01-15,08:00,16:00';
    const bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const buffer = Buffer.concat([bom, Buffer.from(csv, 'utf-8')]);

    const result = csvProcessor.parseAndValidateBuffer(buffer);

    expect(result.isValid).toBe(true);
    expect(result.validEntries).toHaveLength(1);
    expect(result.validEntries[0].teamId).toBe('Torre Soluções');
    expect(result.validEntries[0].personName).toBe('João');
  });

  it('should parse a latin1/Windows-1252 encoded CSV buffer with Portuguese characters', () => {
    // Encode "Torre Soluções,João,joao@email.com,2024-01-15,08:00,16:00" in latin1
    const header = 'team_id,person_name,person_contact,date,start_time,end_time\n';
    const row = 'Torre Solu\xE7\xF5es,Jo\xE3o,joao@email.com,2024-01-15,08:00,16:00';
    const buffer = Buffer.from(header + row, 'latin1');

    const result = csvProcessor.parseAndValidateBuffer(buffer);

    expect(result.isValid).toBe(true);
    expect(result.validEntries).toHaveLength(1);
    expect(result.validEntries[0].teamId).toBe('Torre Soluções');
    expect(result.validEntries[0].personName).toBe('João');
  });

  it('should produce valid UTF-8 area names from any encoding', () => {
    const header = 'team_id,person_name,person_contact,date,start_time,end_time\n';
    const row = 'Torre Solu\xE7\xF5es de Sa\xFAde,Jo\xE3o Andr\xE9,joao@email.com,2024-01-15,08:00,16:00';
    const buffer = Buffer.from(header + row, 'latin1');

    const result = csvProcessor.parseAndValidateBuffer(buffer);

    expect(result.isValid).toBe(true);
    expect(isValidUtf8String(result.validEntries[0].teamId)).toBe(true);
    expect(isValidUtf8String(result.validEntries[0].personName)).toBe(true);
    expect(result.validEntries[0].teamId).toBe('Torre Soluções de Saúde');
    expect(result.validEntries[0].personName).toBe('João André');
  });
});
