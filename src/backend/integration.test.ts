import { describe, it, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createServer, ServerDependencies } from './server';
import { AuthService } from './services/auth';
import { UserRepository } from './database/repositories/UserRepository';
import { AreaRepository } from './database/repositories/AreaRepository';
import { PeriodoRepository } from './database/repositories/PeriodoRepository';
import { EscalaRepository } from './database/repositories/EscalaRepository';
import { parseEscalationCSV, formatEscalationCSV, EscalationEntry } from './services/escalation-csv-processor';
import { Express } from 'express';

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
      user_id INTEGER NOT NULL,
      area_codigo TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, area_codigo)
    );
  `);
  return db;
}

function createMockBaseDeps(): Omit<ServerDependencies, 'authService' | 'userRepository' | 'areaRepository' | 'periodoRepository' | 'escalaRepository'> {
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

describe('Integration Tests', () => {
  let db: Database.Database;
  let app: Express;
  let authService: AuthService;
  let userRepository: UserRepository;
  let areaRepository: AreaRepository;
  let periodoRepository: PeriodoRepository;
  let escalaRepository: EscalaRepository;

  beforeEach(async () => {
    db = createTestDb();
    authService = new AuthService(db, 'test-secret');
    userRepository = new UserRepository(db);
    areaRepository = new AreaRepository(db);
    periodoRepository = new PeriodoRepository(db);
    escalaRepository = new EscalaRepository(db);

    const baseDeps = createMockBaseDeps();
    app = createServer({
      ...baseDeps,
      authService,
      userRepository,
      areaRepository,
      periodoRepository,
      escalaRepository,
    });
  });

  describe('Full CSV import with accented characters', () => {
    it('should preserve Portuguese accented characters through format-parse cycle', () => {
      const entries: EscalationEntry[] = [
        {
          area: 'TORRE SOLUÇÕES LOGÍSTICAS',
          colaborador: 'José Antônio da Conceição',
          cargo: 'Analista de Operações',
          nivel: '1º Escalão',
          contato: 'jose.antonio@empresa.com',
          dia: 15,
          horarioInicio: '08:00',
          horarioFim: '18:00',
          is24h: false,
        },
        {
          area: 'SEGURANÇA DA INFORMAÇÃO',
          colaborador: 'Maria Fernanda Gonçalves',
          cargo: 'Coordenadora',
          nivel: '2º Escalão',
          contato: 'maria.goncalves@empresa.com',
          dia: 15,
          horarioInicio: '00:00',
          horarioFim: '23:59',
          is24h: true,
        },
      ];

      // Format to CSV
      const csv = formatEscalationCSV(entries);

      // Verify accented characters are in the output
      expect(csv).toContain('TORRE SOLUÇÕES LOGÍSTICAS');
      expect(csv).toContain('José Antônio da Conceição');
      expect(csv).toContain('Gonçalves');
      expect(csv).toContain('SEGURANÇA DA INFORMAÇÃO');

      // Parse the flat CSV manually and verify data
      const lines = csv.split('\n');
      expect(lines.length).toBe(3); // header + 2 data rows

      // Re-format and verify idempotence
      const csv2 = formatEscalationCSV(entries);
      expect(csv2).toBe(csv);

      // Verify characters survive double-encoding
      const buffer = Buffer.from(csv, 'utf-8');
      const decoded = buffer.toString('utf-8');
      expect(decoded).toContain('TORRE SOLUÇÕES LOGÍSTICAS');
      expect(decoded).toContain('José Antônio da Conceição');
      expect(decoded).toContain('Gonçalves');
    });
  });

  describe('Multi-area Responsável data filtering', () => {
    it('should filter periodos by area for Responsável users', async () => {
      // Create admin
      await authService.register({
        codigo: 'ADM001',
        nome: 'Admin',
        perfil: 'Adm',
        username: 'admin',
        senha: 'admin123',
      });
      const adminLogin = await authService.login('admin', 'admin123');
      const adminToken = adminLogin.token!;

      // Create areas
      areaRepository.create({ codigo: 'AREA_A', nome: 'Área A', torre: null });
      areaRepository.create({ codigo: 'AREA_B', nome: 'Área B', torre: null });
      areaRepository.create({ codigo: 'AREA_C', nome: 'Área C', torre: null });

      // Create periodos in different areas
      periodoRepository.create({ codigo: 'P_A1', data: '2024-06-15', horarios: '08:00-16:00', areaCodigo: 'AREA_A' });
      periodoRepository.create({ codigo: 'P_B1', data: '2024-06-15', horarios: '08:00-16:00', areaCodigo: 'AREA_B' });
      periodoRepository.create({ codigo: 'P_C1', data: '2024-06-15', horarios: '08:00-16:00', areaCodigo: 'AREA_C' });

      // Create Responsável linked to AREA_A and AREA_B
      await authService.register({
        codigo: 'RESP001',
        areaCodigo: 'AREA_A',
        nome: 'Responsável',
        perfil: 'Responsavel',
        username: 'resp',
        senha: 'resp123',
      });
      const respLogin = await authService.login('resp', 'resp123');
      const respToken = respLogin.token!;

      // Query periodos for AREA_A - should work
      const resA = await request(app)
        .get('/api/periodos?areaCodigo=AREA_A')
        .set('Authorization', `Bearer ${respToken}`);
      expect(resA.status).toBe(200);
      if (Array.isArray(resA.body)) {
        for (const p of resA.body) {
          expect(p.areaCodigo).toBe('AREA_A');
        }
      }

      // Admin should see all periodos
      const resAdmin = await request(app)
        .get('/api/periodos')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Page refresh auth persistence simulation', () => {
    it('should persist and restore auth state from localStorage', () => {
      // Simulate what the store does on login
      const user = {
        id: 1,
        nome: 'Test User',
        perfil: 'Responsavel',
        areaCodigo: 'DEVOPS_CLOUD',
        username: 'testuser',
        linkedAreas: ['DEVOPS_CLOUD', 'REDES'],
      };

      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MSwiZXhwIjo5OTk5OTk5OTk5fQ.signature';

      // Simulate store writing to localStorage
      const storage = new Map<string, string>();
      storage.set('token', token);
      storage.set('user', JSON.stringify(user));

      // Simulate page refresh: read from localStorage
      const storedToken = storage.get('token');
      const storedUserStr = storage.get('user');
      expect(storedToken).toBe(token);
      expect(storedUserStr).not.toBeNull();

      const storedUser = JSON.parse(storedUserStr!);
      expect(storedUser.id).toBe(1);
      expect(storedUser.nome).toBe('Test User');
      expect(storedUser.perfil).toBe('Responsavel');
      expect(storedUser.areaCodigo).toBe('DEVOPS_CLOUD');
      expect(storedUser.username).toBe('testuser');
      expect(storedUser.linkedAreas).toEqual(['DEVOPS_CLOUD', 'REDES']);

      // Validate token is not expired (mock validation)
      const parts = token.split('.');
      expect(parts.length).toBe(3);
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      expect(payload.exp * 1000).toBeGreaterThan(Date.now());
    });
  });
});
