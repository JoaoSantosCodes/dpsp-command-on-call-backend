import Papa from 'papaparse';
import {
  CSVValidationResult,
  CSVValidationError,
  ScheduleConflict,
  ScheduleEntry,
  ImportResult,
} from '../../shared/types';
import { ScheduleRepository } from '../database/repositories/ScheduleRepository';

// Column name aliases (supports both English and Portuguese headers)
const COLUMN_ALIASES: Record<string, string[]> = {
  team_id: ['team_id', 'nome_time'],
  person_name: ['person_name', 'nome_plantonista'],
  person_contact: ['person_contact', 'contato_plantonista'],
  date: ['date', 'data'],
  start_time: ['start_time', 'horario_inicio'],
  end_time: ['end_time', 'horario_fim'],
};

const REQUIRED_COLUMNS = ['team_id', 'person_name', 'date', 'start_time', 'end_time'];

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^\d{2}:\d{2}$/;

interface NormalizedRow {
  team_id: string;
  person_name: string;
  person_contact: string;
  date: string;
  start_time: string;
  end_time: string;
}

export class CSVProcessor {
  private scheduleRepository: ScheduleRepository;

  constructor(scheduleRepository: ScheduleRepository) {
    this.scheduleRepository = scheduleRepository;
  }

  parseAndValidate(csvContent: string): CSVValidationResult {
    const errors: CSVValidationError[] = [];
    const validEntries: ScheduleEntry[] = [];

    // Parse CSV with PapaParse
    const parsed = Papa.parse<Record<string, string>>(csvContent.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim().toLowerCase(),
    });

    // Check for parse errors
    if (parsed.errors.length > 0) {
      for (const err of parsed.errors) {
        errors.push({
          line: (err.row ?? 0) + 2, // +2: 1-indexed + header row
          column: '',
          message: err.message,
        });
      }
    }

    // Validate required columns exist
    const headers = parsed.meta.fields || [];
    const columnMap = this.buildColumnMap(headers);
    const missingColumns = this.getMissingColumns(columnMap);

    if (missingColumns.length > 0) {
      return {
        isValid: false,
        validEntries: [],
        errors: [
          {
            line: 1,
            column: missingColumns.join(', '),
            message: `Colunas obrigatórias ausentes: ${missingColumns.join(', ')}`,
          },
        ],
        conflicts: [],
      };
    }

    // Validate each row
    for (let i = 0; i < parsed.data.length; i++) {
      const lineNumber = i + 2; // +2: 1-indexed + header row
      const row = parsed.data[i];
      const normalized = this.normalizeRow(row, columnMap);
      const rowErrors = this.validateRow(normalized, lineNumber);

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
      } else {
        validEntries.push({
          teamId: normalized.team_id,
          personName: normalized.person_name,
          personContact: normalized.person_contact || undefined,
          date: normalized.date,
          startTime: normalized.start_time,
          endTime: normalized.end_time,
        });
      }
    }

    // Detect conflicts among valid entries
    const conflicts = this.detectConflicts(validEntries);

    const isValid = errors.length === 0 && conflicts.length === 0;

    return {
      isValid,
      validEntries,
      errors,
      conflicts,
    };
  }

  importSchedule(validatedData: ScheduleEntry[]): ImportResult {
    if (validatedData.length === 0) {
      return {
        success: false,
        importedCount: 0,
        teamId: '',
        replacedPrevious: false,
      };
    }

    // Group entries by teamId
    const byTeam = new Map<string, ScheduleEntry[]>();
    for (const entry of validatedData) {
      const existing = byTeam.get(entry.teamId) || [];
      existing.push(entry);
      byTeam.set(entry.teamId, existing);
    }

    // For each team: delete existing and insert new
    // Return result for the first (or only) team for simplicity
    // If multiple teams, process all but return combined result
    let totalImported = 0;
    let firstTeamId = '';
    let replacedPrevious = false;

    for (const [teamId, entries] of byTeam) {
      if (!firstTeamId) firstTeamId = teamId;

      // Check if there's existing data
      const existing = this.scheduleRepository.getByTeam(teamId);
      if (existing.length > 0) {
        replacedPrevious = true;
      }

      // Delete existing schedule for this team
      this.scheduleRepository.deleteByTeam(teamId);

      // Insert new entries
      this.scheduleRepository.insertMany(entries);
      totalImported += entries.length;
    }

    return {
      success: true,
      importedCount: totalImported,
      teamId: firstTeamId,
      replacedPrevious,
    };
  }

  private buildColumnMap(headers: string[]): Map<string, string> {
    const map = new Map<string, string>();

    for (const [canonical, aliases] of Object.entries(COLUMN_ALIASES)) {
      for (const alias of aliases) {
        if (headers.includes(alias)) {
          map.set(canonical, alias);
          break;
        }
      }
    }

    return map;
  }

  private getMissingColumns(columnMap: Map<string, string>): string[] {
    return REQUIRED_COLUMNS.filter((col) => !columnMap.has(col));
  }

  private normalizeRow(row: Record<string, string>, columnMap: Map<string, string>): NormalizedRow {
    return {
      team_id: (row[columnMap.get('team_id')!] || '').trim(),
      person_name: (row[columnMap.get('person_name')!] || '').trim(),
      person_contact: (row[columnMap.get('person_contact') || ''] || '').trim(),
      date: (row[columnMap.get('date')!] || '').trim(),
      start_time: (row[columnMap.get('start_time')!] || '').trim(),
      end_time: (row[columnMap.get('end_time')!] || '').trim(),
    };
  }

  private validateRow(row: NormalizedRow, lineNumber: number): CSVValidationError[] {
    const errors: CSVValidationError[] = [];

    // Check required fields non-empty
    if (!row.team_id) {
      errors.push({ line: lineNumber, column: 'team_id', message: 'Campo obrigatório vazio' });
    }
    if (!row.person_name) {
      errors.push({ line: lineNumber, column: 'person_name', message: 'Campo obrigatório vazio' });
    }
    if (!row.date) {
      errors.push({ line: lineNumber, column: 'date', message: 'Campo obrigatório vazio' });
    }
    if (!row.start_time) {
      errors.push({ line: lineNumber, column: 'start_time', message: 'Campo obrigatório vazio' });
    }
    if (!row.end_time) {
      errors.push({ line: lineNumber, column: 'end_time', message: 'Campo obrigatório vazio' });
    }

    // Validate date format
    if (row.date && !DATE_REGEX.test(row.date)) {
      errors.push({
        line: lineNumber,
        column: 'date',
        message: 'Data deve estar no formato YYYY-MM-DD',
      });
    }

    // Validate time formats
    if (row.start_time && !TIME_REGEX.test(row.start_time)) {
      errors.push({
        line: lineNumber,
        column: 'start_time',
        message: 'Horário deve estar no formato HH:mm',
      });
    }
    if (row.end_time && !TIME_REGEX.test(row.end_time)) {
      errors.push({
        line: lineNumber,
        column: 'end_time',
        message: 'Horário deve estar no formato HH:mm',
      });
    }

    return errors;
  }

  private detectConflicts(entries: ScheduleEntry[]): ScheduleConflict[] {
    const conflicts: ScheduleConflict[] = [];
    const conflictSet = new Set<string>();

    // Group by team and date
    const grouped = new Map<string, ScheduleEntry[]>();
    for (const entry of entries) {
      const key = `${entry.teamId}|${entry.date}`;
      const group = grouped.get(key) || [];
      group.push(entry);
      grouped.set(key, group);
    }

    // Check for overlaps within each group
    for (const [key, group] of grouped) {
      if (group.length < 2) continue;

      const conflictingEntries: ScheduleEntry[] = [];

      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          if (this.hasTimeOverlap(group[i], group[j])) {
            const conflictKey = `${key}|${i}|${j}`;
            if (!conflictSet.has(conflictKey)) {
              conflictSet.add(conflictKey);
              if (!conflictingEntries.includes(group[i])) {
                conflictingEntries.push(group[i]);
              }
              if (!conflictingEntries.includes(group[j])) {
                conflictingEntries.push(group[j]);
              }
            }
          }
        }
      }

      if (conflictingEntries.length > 0) {
        const [teamId, date] = key.split('|');
        conflicts.push({
          teamId,
          date,
          conflictingEntries,
        });
      }
    }

    return conflicts;
  }

  private hasTimeOverlap(a: ScheduleEntry, b: ScheduleEntry): boolean {
    // Overlap condition: start1 < end2 && start2 < end1
    return a.startTime < b.endTime && b.startTime < a.endTime;
  }
}
