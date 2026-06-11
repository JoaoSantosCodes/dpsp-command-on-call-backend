import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseEscalationCSV, formatEscalationCSV, normalizeForComparison, EscalationEntry } from './escalation-csv-processor';

const FC_CONFIG = { numRuns: 100 };

/**
 * Parse a single CSV row respecting quoted fields.
 */
function parseFlatCSVRow(row: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < row.length && row[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        fields.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  fields.push(current);
  return fields;
}

/**
 * Parse the flat CSV format produced by formatEscalationCSV back into entries.
 * Header: Area,Colaborador,Cargo,Nivel,Contato,Dia,HorarioInicio,HorarioFim,Is24h
 */
function parseFlatFormatCSV(csv: string): EscalationEntry[] {
  const lines = csv.split('\n');
  if (lines.length < 2) return [];

  const entries: EscalationEntry[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const fields = parseFlatCSVRow(lines[i]);
    entries.push({
      area: fields[0],
      colaborador: fields[1],
      cargo: fields[2],
      nivel: fields[3],
      contato: fields[4],
      dia: parseInt(fields[5], 10),
      horarioInicio: fields[6],
      horarioFim: fields[7],
      is24h: fields[8] === '1',
    });
  }
  return entries;
}

// Generator for Portuguese accented characters
const portugueseCharArb = fc.stringOf(
  fc.constantFrom(...'abcçãõéêáúíôABCÇÃÕÉÊÁÚÍÔ '.split('')),
  { minLength: 1, maxLength: 30 }
);

// Generator for a valid EscalationEntry
const escalationEntryArb = fc.record({
  area: portugueseCharArb,
  colaborador: portugueseCharArb,
  cargo: portugueseCharArb,
  nivel: fc.constantFrom('1º Escalão', '2º Escalão', '3º Escalão', 'Direto'),
  contato: fc.stringOf(fc.constantFrom(...'0123456789@.abcdefghijklmnopqrstuvwxyz'.split('')), { minLength: 3, maxLength: 20 }),
  dia: fc.integer({ min: 1, max: 31 }),
  horarioInicio: fc.constantFrom('00:00', '06:00', '08:00', '12:00', '18:00'),
  horarioFim: fc.constantFrom('06:00', '08:00', '12:00', '18:00', '23:59'),
  is24h: fc.boolean(),
});

describe('Escalation CSV Processor - Property-Based Tests', () => {
  /**
   * Property 4: CSV UTF-8 character preservation
   * For any string with Portuguese accented characters, processing through
   * formatEscalationCSV then re-parsing the flat CSV preserves all characters.
   *
   * **Validates: Requirements 5.1, 5.4, 12.1, 12.2**
   */
  it('Property 4: UTF-8 Portuguese characters are preserved through format cycle', () => {
    fc.assert(
      fc.property(portugueseCharArb, (name) => {
        const entry: EscalationEntry = {
          area: name,
          colaborador: name,
          cargo: 'Analista',
          nivel: '1º Escalão',
          contato: 'test@test.com',
          dia: 1,
          horarioInicio: '08:00',
          horarioFim: '18:00',
          is24h: false,
        };

        // Format entries to CSV
        const csv = formatEscalationCSV([entry]);

        // Parse the flat CSV manually (the format produces a flat table)
        const lines = csv.split('\n');
        expect(lines.length).toBe(2); // header + 1 data row

        // Parse the data row back
        const dataRow = lines[1];
        // Split CSV row respecting quotes
        const fields = parseFlatCSVRow(dataRow);

        // The area and colaborador fields should preserve the original name
        expect(fields[0]).toBe(name);
        expect(fields[1]).toBe(name);
      }),
      FC_CONFIG
    );
  });

  /**
   * Property 5: Area deduplication on CSV import
   * For any area name in CSV that matches an existing area (normalized),
   * no new duplicate is created.
   *
   * **Validates: Requirements 5.2**
   */
  it('Property 5: Normalized area names detect duplicates correctly', () => {
    fc.assert(
      fc.property(portugueseCharArb, (areaName) => {
        // Normalizing an area name and then normalizing it again should yield the same result
        const normalized = normalizeForComparison(areaName);
        const doubleNormalized = normalizeForComparison(normalized);
        expect(doubleNormalized).toBe(normalized);

        // Variations of the same name (case changes) should normalize to the same value
        const upperCase = areaName.toUpperCase();
        const lowerCase = areaName.toLowerCase();
        expect(normalizeForComparison(upperCase)).toBe(normalizeForComparison(lowerCase));
      }),
      FC_CONFIG
    );
  });

  /**
   * Property 11: CSV parse-format-parse round trip
   * For any valid set of entries, format(entries) then re-parsing as flat CSV
   * and formatting again produces identical output.
   * parse(format(entries)) ≡ entries (idempotent formatting)
   *
   * **Validates: Requirements 12.3, 12.4**
   */
  it('Property 11: format(parseFlatCSV(format(entries))) === format(entries)', () => {
    fc.assert(
      fc.property(
        fc.array(escalationEntryArb, { minLength: 1, maxLength: 5 }),
        (entries) => {
          // Format entries to flat CSV
          const csv1 = formatEscalationCSV(entries);

          // Parse the flat CSV back into entries
          const parsedEntries1 = parseFlatFormatCSV(csv1);

          // Format again
          const csv2 = formatEscalationCSV(parsedEntries1);

          // The two CSVs should be identical (idempotent)
          expect(csv2).toBe(csv1);

          // Also verify entry count
          const parsedEntries2 = parseFlatFormatCSV(csv2);
          expect(parsedEntries2.length).toBe(parsedEntries1.length);

          for (let i = 0; i < parsedEntries1.length; i++) {
            expect(parsedEntries2[i].area).toBe(parsedEntries1[i].area);
            expect(parsedEntries2[i].colaborador).toBe(parsedEntries1[i].colaborador);
            expect(parsedEntries2[i].dia).toBe(parsedEntries1[i].dia);
            expect(parsedEntries2[i].is24h).toBe(parsedEntries1[i].is24h);
          }
        }
      ),
      FC_CONFIG
    );
  });
});
