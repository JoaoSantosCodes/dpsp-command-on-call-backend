// Feature: command-center-v2-improvements, Property 13: Command user write operation blocking
// For any write request (POST, PUT, DELETE) to protected endpoints with a valid Plantonista/Command
// user token, the system SHALL return HTTP 403 Forbidden.
// **Validates: Requirements 13.2**

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createServer, ServerDependencies } from '../server';
import { AuthService } from '../services/auth';
import { UserRepository } from '../database/repositories/UserRepository';
import { AreaRepository } from '../database/repositories/AreaRepository';
import { PeriodoRepository } from '../database/repositories/PeriodoRepository';
import { EscalaRepository } from '../database/repositories/EscalaRepository';
import { Express } from 'express';
import { vi } from 'vitest';

const FC_CONFIG = { numRuns: 50 };

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.exec(`
    CREATE TABLE IF NOT EXISTS areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      nome TEXT NOT NULL,
      torre TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      area_codigo TEXT,
      nome TEXT NOT NULL,
      perfil TEXT NOT NULL CHECK(perfil IN ('Adm', 'Responsavel', 'Plantonista')),
      cargo TEXT,
      contato TEXT,
      username TEXT NOT NULL UNIQUE,
      senha_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS periodos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      data TEXT NOT NULL,
      horarios TEXT NOT NULL,
      area_codigo TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS escalas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      codigo TEXT NOT NULL UNIQUE,
      area_codigo TEXT NOT NULL,
      periodo_codigo TEXT NOT NULL,
      usuario_codigo TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS user_areas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      area_codigo TEXT NOT NULL REFERENCES areas(codigo),
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, area_codigo)
    );
    CREATE TABLE IF NOT EXISTS area_escalation_chains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      area_codigo TEXT NOT NULL REFERENCES areas(codigo),
      person_name TEXT NOT NULL,
      person_contact TEXT,
      position INTEGER NOT NULL,
      UNIQUE(area_codigo, position)
    );
  `);
  return db;
}

function createMockBaseDeps() {
  return {
    datadogPollingService: {
      isRunning: true,
      getMonitors: vi.fn().mockReturnValue([]),
      start: vi.fn(),
      stop: vi.fn(),
      onMonitorStateChange: vi.fn(),
    } as any,
    escalationEngine: {
      startEscalation: vi.fn(),
      acknowledgeIncident: vi.fn(),
      getActiveEscalations: vi.fn().mockReturnValue([]),
      onEscalationEvent: vi.fn(),
      stopAll: vi.fn(),
    } as any,
    scheduleManager: {
      getCurrentOnCall: vi.fn().mockReturnValue(null),
      getEscalationChain: vi.fn().mockReturnValue([]),
      updateEscalationChain: vi.fn(),
    } as any,
    monitorMappingService: {
      getTeamForMonitor: vi.fn(),
      setMonitorTeamMapping: vi.fn(),
      getUnmappedMonitors: vi.fn().mockReturnValue([]),
      getMappingsForTeam: vi.fn().mockReturnValue([]),
    } as any,
    incidentHistoryService: {
      recordIncident: vi.fn(),
      recordEscalation: vi.fn(),
      recordResolution: vi.fn(),
      queryHistory: vi.fn().mockReturnValue([]),
    } as any,
    csvProcessor: {
      parseAndValidate: vi.fn(),
      parseAndValidateBuffer: vi.fn(),
      importSchedule: vi.fn(),
    } as any,
    teamRepository: {
      getAll: vi.fn().mockReturnValue([]),
      getById: vi.fn(),
      exists: vi.fn(),
    } as any,
  };
}

/**
 * Property 13: Command user write operation blocking
 *
 * For any write request (POST, PUT, DELETE) to protected endpoints
 * (schedules/periodos, areas management, user management) with a valid
 * Plantonista/Command user token, the system SHALL return HTTP 403 Forbidden.
 *
 * **Validates: Requirements 13.2**
 */
describe('Property 13: Command user write operation blocking', () => {
  let db: Database.Database;
  let app: Express;
  let commandUserToken: string;
  let authService: AuthService;
  let areaRepository: AreaRepository;
  let periodoRepository: PeriodoRepository;

  beforeEach(async () => {
    db = createTestDb();
    authService = new AuthService(db, 'test-secret-pbt');
    const userRepository = new UserRepository(db);
    areaRepository = new AreaRepository(db);
    periodoRepository = new PeriodoRepository(db);
    const escalaRepository = new EscalaRepository(db);

    const baseDeps = createMockBaseDeps();
    app = createServer({
      ...baseDeps,
      authService,
      userRepository,
      areaRepository,
      periodoRepository,
      escalaRepository,
    });

    // Create test area
    areaRepository.create({ codigo: 'AREA_TEST', nome: 'Área de Teste', torre: 'Torre Teste' });

    // Create a Command (Plantonista) user assigned to the test area
    await authService.register({
      codigo: 'CMD001',
      areaCodigo: 'AREA_TEST',
      nome: 'Command User',
      perfil: 'Plantonista',
      username: 'command_user',
      senha: 'command123',
    });
    const login = await authService.login('command_user', 'command123');
    commandUserToken = login.token!;

    // Create a periodo for DELETE/PUT tests
    periodoRepository.create({
      codigo: 'PER_TEST',
      data: '2024-06-15',
      horarios: '08:00-16:00',
      areaCodigo: 'AREA_TEST',
    });
  });

  it('Property 13a: POST to any protected schedule endpoint with Command token returns 403', async () => {
    // Arbitrary POST body payloads for the schedule (periodos) endpoint
    const arbitraryPayload = fc.record({
      codigo: fc.string({ minLength: 1, maxLength: 20 }),
      data: fc.constant('2024-07-10'),
      horarios: fc.constant('08:00-16:00'),
      areaCodigo: fc.constant('AREA_TEST'),
    });

    await fc.assert(
      fc.asyncProperty(
        arbitraryPayload,
        async (payload) => {
          const res = await request(app)
            .post('/api/periodos')
            .set('Authorization', `Bearer ${commandUserToken}`)
            .send(payload);

          expect(res.status).toBe(403);
        }
      ),
      FC_CONFIG
    );
  });

  it('Property 13b: PUT to any protected schedule endpoint with Command token returns 403', async () => {
    const arbitraryPayload = fc.record({
      data: fc.constant('2024-07-11'),
      horarios: fc.constant('16:00-00:00'),
    });

    await fc.assert(
      fc.asyncProperty(
        arbitraryPayload,
        async (payload) => {
          const res = await request(app)
            .put('/api/periodos/1')
            .set('Authorization', `Bearer ${commandUserToken}`)
            .send(payload);

          expect(res.status).toBe(403);
        }
      ),
      FC_CONFIG
    );
  });

  it('Property 13c: DELETE to any protected schedule endpoint with Command token returns 403', async () => {
    // Test with various period IDs (the actual existence doesn't matter — should be blocked before lookup)
    const arbitraryId = fc.integer({ min: 1, max: 9999 });

    await fc.assert(
      fc.asyncProperty(
        arbitraryId,
        async (id) => {
          const res = await request(app)
            .delete(`/api/periodos/${id}`)
            .set('Authorization', `Bearer ${commandUserToken}`);

          expect(res.status).toBe(403);
        }
      ),
      FC_CONFIG
    );
  });

  it('Property 13d: POST/PUT/DELETE to escala endpoints with Command token returns 403', async () => {
    // Test all three HTTP write methods against escalas endpoints
    const writeMethodAndPayload = fc.tuple(
      fc.constantFrom('POST', 'PUT', 'DELETE') as fc.Arbitrary<'POST' | 'PUT' | 'DELETE'>,
      fc.record({
        codigo: fc.string({ minLength: 1, maxLength: 20 }),
        areaCodigo: fc.constant('AREA_TEST'),
        periodoCodigo: fc.constant('PER_TEST'),
        usuarioCodigo: fc.constant('CMD001'),
      })
    );

    await fc.assert(
      fc.asyncProperty(
        writeMethodAndPayload,
        async ([method, payload]) => {
          let res: request.Response;
          if (method === 'POST') {
            res = await request(app)
              .post('/api/escalas')
              .set('Authorization', `Bearer ${commandUserToken}`)
              .send(payload);
          } else if (method === 'PUT') {
            res = await request(app)
              .put('/api/escalas/1')
              .set('Authorization', `Bearer ${commandUserToken}`)
              .send(payload);
          } else {
            res = await request(app)
              .delete('/api/escalas/1')
              .set('Authorization', `Bearer ${commandUserToken}`);
          }

          expect(res.status).toBe(403);
        }
      ),
      FC_CONFIG
    );
  });

  it('Property 13e: POST/PUT/DELETE to area management endpoints with Command token returns 403', async () => {
    const arbitraryAreaPayload = fc.record({
      codigo: fc.string({ minLength: 1, maxLength: 20 }).filter(s => /^[A-Z0-9_]+$/.test(s)),
      nome: fc.string({ minLength: 1, maxLength: 50 }),
      torre: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: null }),
    });

    await fc.assert(
      fc.asyncProperty(
        arbitraryAreaPayload,
        async (payload) => {
          // POST /api/areas
          const postRes = await request(app)
            .post('/api/areas')
            .set('Authorization', `Bearer ${commandUserToken}`)
            .send(payload);
          expect(postRes.status).toBe(403);

          // PUT /api/areas/:id
          const putRes = await request(app)
            .put('/api/areas/1')
            .set('Authorization', `Bearer ${commandUserToken}`)
            .send({ nome: payload.nome });
          expect(putRes.status).toBe(403);

          // DELETE /api/areas/:id
          const deleteRes = await request(app)
            .delete('/api/areas/1')
            .set('Authorization', `Bearer ${commandUserToken}`);
          expect(deleteRes.status).toBe(403);
        }
      ),
      FC_CONFIG
    );
  });

  it('Property 13f: POST/PUT/DELETE to user management endpoints with Command token returns 403', async () => {
    const arbitraryUserPayload = fc.record({
      codigo: fc.string({ minLength: 1, maxLength: 20 }),
      nome: fc.string({ minLength: 1, maxLength: 50 }),
      perfil: fc.constantFrom('Plantonista', 'Responsavel', 'Adm'),
      username: fc.string({ minLength: 1, maxLength: 30 }),
      senha: fc.string({ minLength: 6, maxLength: 20 }),
    });

    await fc.assert(
      fc.asyncProperty(
        arbitraryUserPayload,
        async (payload) => {
          // POST /api/users
          const postRes = await request(app)
            .post('/api/users')
            .set('Authorization', `Bearer ${commandUserToken}`)
            .send(payload);
          expect(postRes.status).toBe(403);

          // PUT /api/users/:id
          const putRes = await request(app)
            .put('/api/users/1')
            .set('Authorization', `Bearer ${commandUserToken}`)
            .send({ nome: payload.nome });
          expect(putRes.status).toBe(403);

          // DELETE /api/users/:id
          const deleteRes = await request(app)
            .delete('/api/users/1')
            .set('Authorization', `Bearer ${commandUserToken}`);
          expect(deleteRes.status).toBe(403);
        }
      ),
      FC_CONFIG
    );
  });

  it('Property 13g: All HTTP write methods on all protected endpoints are blocked regardless of request body', async () => {
    // Protected write endpoints that Command users must not access
    const protectedEndpoints: Array<{ method: 'POST' | 'PUT' | 'DELETE'; path: string }> = [
      { method: 'POST', path: '/api/periodos' },
      { method: 'PUT', path: '/api/periodos/1' },
      { method: 'DELETE', path: '/api/periodos/1' },
      { method: 'POST', path: '/api/escalas' },
      { method: 'PUT', path: '/api/escalas/1' },
      { method: 'DELETE', path: '/api/escalas/1' },
      { method: 'POST', path: '/api/areas' },
      { method: 'PUT', path: '/api/areas/1' },
      { method: 'DELETE', path: '/api/areas/1' },
      { method: 'POST', path: '/api/users' },
      { method: 'PUT', path: '/api/users/1' },
      { method: 'DELETE', path: '/api/users/1' },
    ];

    // Arbitrary JSON body content
    const arbitraryBody = fc.oneof(
      fc.constant({}),
      fc.record({ codigo: fc.string(), nome: fc.string() }),
      fc.record({ data: fc.constant('2024-08-01'), areaCodigo: fc.constant('AREA_TEST') }),
    );

    await fc.assert(
      fc.asyncProperty(
        // Pick a random endpoint from the list
        fc.integer({ min: 0, max: protectedEndpoints.length - 1 }),
        arbitraryBody,
        async (endpointIndex, body) => {
          const { method, path } = protectedEndpoints[endpointIndex];

          let res: request.Response;
          if (method === 'POST') {
            res = await request(app).post(path).set('Authorization', `Bearer ${commandUserToken}`).send(body);
          } else if (method === 'PUT') {
            res = await request(app).put(path).set('Authorization', `Bearer ${commandUserToken}`).send(body);
          } else {
            res = await request(app).delete(path).set('Authorization', `Bearer ${commandUserToken}`);
          }

          // The system MUST return 403 for all write operations from Command users
          expect(res.status).toBe(403);
        }
      ),
      FC_CONFIG
    );
  });
});
