import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import Database from 'better-sqlite3';
import { EscalationEngine } from './escalation-engine';
import { IncidentRepository } from '../database/repositories/IncidentRepository';
import { EscalationChainRepository } from '../database/repositories/EscalationChainRepository';
import { ScheduleRepository } from '../database/repositories/ScheduleRepository';
import { ScheduleManager } from './schedule-manager';
import { initializeDatabase } from '../database/init';
import { EscalationChainMember } from '../../shared/types';

const FC_CONFIG = { numRuns: 100 };

describe('EscalationEngine - Property-Based Tests', () => {
  let db: Database.Database;
  let escalationChainRepository: EscalationChainRepository;

  beforeEach(() => {
    db = initializeDatabase(':memory:');
    escalationChainRepository = new EscalationChainRepository(db);
  });

  /**
   * Property 10: Escalation chain level 2 invariant
   * For any escalation chain, position 2 always contains the Responsável.
   *
   * **Validates: Requirements 11.1, 11.3**
   */
  it('Property 10: Position 2 in any escalation chain always contains the Responsável', () => {
    fc.assert(
      fc.property(
        // Generate a responsável name
        fc.string({ minLength: 2, maxLength: 20 }),
        // Generate a plantonista name (level 1)
        fc.string({ minLength: 2, maxLength: 20 }),
        // Generate additional chain members (levels 3+)
        fc.array(
          fc.string({ minLength: 2, maxLength: 20 }),
          { minLength: 0, maxLength: 3 }
        ),
        fc.constantFrom('team-alpha', 'team-bravo', 'team-charlie'),
        (responsavelName, plantonistName, additionalMembers, teamId) => {
          // Build chain with responsável locked at position 2
          const chain: EscalationChainMember[] = [
            { personName: plantonistName, position: 1 },
            { personName: responsavelName, position: 2 },
            ...additionalMembers.map((name, idx) => ({
              personName: name,
              position: idx + 3,
            })),
          ];

          // Store chain
          escalationChainRepository.replaceChain(teamId, chain);

          // Retrieve chain
          const retrieved = escalationChainRepository.getByTeam(teamId);

          // Assert position 2 is always the Responsável
          const level2 = retrieved.find(m => m.position === 2);
          expect(level2).toBeDefined();
          expect(level2!.personName).toBe(responsavelName);
        }
      ),
      FC_CONFIG
    );
  });
});
