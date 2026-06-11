import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../init';
import { PeriodoRepository } from './PeriodoRepository';

const FC_CONFIG = { numRuns: 100 };

describe('PeriodoRepository - Property-Based Tests', () => {
  let db: Database.Database;
  let repo: PeriodoRepository;

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    repo = new PeriodoRepository(db);
  });

  /**
   * Property 7: Periodo code uniqueness
   * For any sequence of N calls to generateCode() with same params,
   * all generated codes are unique.
   *
   * **Validates: Requirements 7.1, 7.3**
   */
  it('Property 7: All generated codes are unique for any sequence of calls', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.constantFrom('DEVOPS_CLOUD', 'REDES', 'PDV', 'BALCAO'),
        fc.date({
          min: new Date('2024-01-01'),
          max: new Date('2026-12-31'),
        }),
        (count, areaCodigo, date) => {
          const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
          const codes = new Set<string>();

          for (let i = 0; i < count; i++) {
            const code = repo.generateCode(areaCodigo, dateStr);
            // Insert the periodo so the next call sees it
            repo.create({
              codigo: code,
              data: dateStr,
              horarios: '08:00-16:00',
              areaCodigo,
            });
            codes.add(code);
          }

          // All codes should be unique
          expect(codes.size).toBe(count);
        }
      ),
      FC_CONFIG
    );
  });
});
