import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createServer, ServerDependencies } from '../server';
import { AuthService } from '../services/auth';
import { UserRepository } from '../database/repositories/UserRepository';
import { AreaRepository } from '../database/repositories/AreaRepository';
import { PeriodoRepository } from '../database/repositories/PeriodoRepository';
import { EscalaRepository } from '../database/repositories/EscalaRepository';
import { roleMiddleware, areaFilterMiddleware, getEffectiveAreaFilter } from './auth';
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

describe('roleMiddleware', () => {
  it('should call next when user profile is in allowed list', () => {
    const middleware = roleMiddleware(['Adm', 'Responsavel']);
    const req = { user: { perfil: 'Adm', userId: 1, username: 'admin', areaCodigo: null } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('should return 403 when user profile is not in allowed list', () => {
    const middleware = roleMiddleware(['Adm']);
    const req = { user: { perfil: 'Plantonista', userId: 2, username: 'plant', areaCodigo: 'A1' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Acesso não autorizado para este perfil' });
  });

  it('should return 401 when user is not set on request', () => {
    const middleware = roleMiddleware(['Adm']);
    const req = {} as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('should allow Responsavel when in allowed profiles list', () => {
    const middleware = roleMiddleware(['Responsavel', 'Plantonista']);
    const req = { user: { perfil: 'Responsavel', userId: 3, username: 'resp', areaCodigo: 'A1' } } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});

describe('areaFilterMiddleware', () => {
  it('should allow Adm to access without area restriction', () => {
    const req = {
      user: { perfil: 'Adm', userId: 1, username: 'admin', areaCodigo: null },
      selectedArea: null,
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    areaFilterMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
  });

  it('should set selectedArea to areaCodigo for Responsavel', () => {
    const req = {
      user: { perfil: 'Responsavel', userId: 2, username: 'resp', areaCodigo: 'AREA1' },
      selectedArea: undefined,
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    areaFilterMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.selectedArea).toBe('AREA1');
  });

  it('should return 403 if Responsavel tries to access another area', () => {
    const req = {
      user: { perfil: 'Responsavel', userId: 2, username: 'resp', areaCodigo: 'AREA1' },
      selectedArea: 'AREA2',
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    areaFilterMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('should set selectedArea to areaCodigo for Plantonista', () => {
    const req = {
      user: { perfil: 'Plantonista', userId: 3, username: 'plant', areaCodigo: 'AREA1' },
      selectedArea: undefined,
    } as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    areaFilterMiddleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(req.selectedArea).toBe('AREA1');
  });

  it('should return 401 if user is not set', () => {
    const req = {} as any;
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
    const next = vi.fn();

    areaFilterMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});

describe('getEffectiveAreaFilter', () => {
  it('should return null for Adm without selected area', () => {
    const req = {
      user: { perfil: 'Adm', userId: 1, username: 'admin', areaCodigo: null },
      selectedArea: null,
    } as any;
    expect(getEffectiveAreaFilter(req)).toBeNull();
  });

  it('should return selected area for Adm with selection', () => {
    const req = {
      user: { perfil: 'Adm', userId: 1, username: 'admin', areaCodigo: null },
      selectedArea: 'AREA1',
    } as any;
    expect(getEffectiveAreaFilter(req)).toBe('AREA1');
  });

  it('should return areaCodigo for Responsavel', () => {
    const req = {
      user: { perfil: 'Responsavel', userId: 2, username: 'resp', areaCodigo: 'AREA2' },
      selectedArea: 'AREA2',
    } as any;
    expect(getEffectiveAreaFilter(req)).toBe('AREA2');
  });

  it('should return areaCodigo for Plantonista', () => {
    const req = {
      user: { perfil: 'Plantonista', userId: 3, username: 'plant', areaCodigo: 'AREA3' },
      selectedArea: 'AREA3',
    } as any;
    expect(getEffectiveAreaFilter(req)).toBe('AREA3');
  });
});

describe('Role-based access control integration', () => {
  let db: Database.Database;
  let app: Express;
  let authService: AuthService;
  let areaRepository: AreaRepository;
  let periodoRepository: PeriodoRepository;
  let escalaRepository: EscalaRepository;
  let adminToken: string;
  let responsavelToken: string;
  let plantonistaToken: string;

  beforeEach(async () => {
    db = createTestDb();
    authService = new AuthService(db, 'test-secret');
    const userRepository = new UserRepository(db);
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

    // Create areas
    areaRepository.create({ codigo: 'AREA1', nome: 'Area 1', torre: 'Torre A' });
    areaRepository.create({ codigo: 'AREA2', nome: 'Area 2', torre: 'Torre B' });

    // Create admin
    await authService.register({
      codigo: 'ADM001',
      nome: 'Admin',
      perfil: 'Adm',
      username: 'admin',
      senha: 'admin123',
    });
    const adminLogin = await authService.login('admin', 'admin123');
    adminToken = adminLogin.token!;

    // Create responsavel for AREA1
    await authService.register({
      codigo: 'RESP001',
      areaCodigo: 'AREA1',
      nome: 'Responsavel Area1',
      perfil: 'Responsavel',
      username: 'resp1',
      senha: 'resp123',
    });
    const respLogin = await authService.login('resp1', 'resp123');
    responsavelToken = respLogin.token!;

    // Create plantonista for AREA1
    await authService.register({
      codigo: 'PLAN001',
      areaCodigo: 'AREA1',
      nome: 'Plantonista Area1',
      perfil: 'Plantonista',
      username: 'plant1',
      senha: 'plant123',
    });
    const plantLogin = await authService.login('plant1', 'plant123');
    plantonistaToken = plantLogin.token!;

    // Create periodos for different areas
    periodoRepository.create({ codigo: 'PER_A1', data: '2024-01-15', horarios: '08:00-16:00', areaCodigo: 'AREA1' });
    periodoRepository.create({ codigo: 'PER_A2', data: '2024-01-15', horarios: '08:00-16:00', areaCodigo: 'AREA2' });

    // Create escalas for different areas
    escalaRepository.create({ codigo: 'ESC_A1', areaCodigo: 'AREA1', periodoCodigo: 'PER_A1', usuarioCodigo: 'PLAN001' });
    escalaRepository.create({ codigo: 'ESC_A2', areaCodigo: 'AREA2', periodoCodigo: 'PER_A2', usuarioCodigo: 'ADM001' });
  });

  describe('POST /api/auth/select-area', () => {
    it('should allow Adm to select any area', async () => {
      const res = await request(app)
        .post('/api/auth/select-area')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ areaCodigo: 'AREA2' });
      expect(res.status).toBe(200);
      expect(res.body.selectedArea).toBe('AREA2');
    });

    it('should allow Responsavel to select their own area', async () => {
      const res = await request(app)
        .post('/api/auth/select-area')
        .set('Authorization', `Bearer ${responsavelToken}`)
        .send({ areaCodigo: 'AREA1' });
      expect(res.status).toBe(200);
      expect(res.body.selectedArea).toBe('AREA1');
    });

    it('should deny Responsavel selecting another area', async () => {
      const res = await request(app)
        .post('/api/auth/select-area')
        .set('Authorization', `Bearer ${responsavelToken}`)
        .send({ areaCodigo: 'AREA2' });
      expect(res.status).toBe(403);
    });

    it('should allow Plantonista to select their own area', async () => {
      const res = await request(app)
        .post('/api/auth/select-area')
        .set('Authorization', `Bearer ${plantonistaToken}`)
        .send({ areaCodigo: 'AREA1' });
      expect(res.status).toBe(200);
      expect(res.body.selectedArea).toBe('AREA1');
    });

    it('should deny Plantonista selecting another area', async () => {
      const res = await request(app)
        .post('/api/auth/select-area')
        .set('Authorization', `Bearer ${plantonistaToken}`)
        .send({ areaCodigo: 'AREA2' });
      expect(res.status).toBe(403);
    });

    it('should return 400 when areaCodigo is missing', async () => {
      const res = await request(app)
        .post('/api/auth/select-area')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(400);
    });

    it('should require authentication', async () => {
      const res = await request(app)
        .post('/api/auth/select-area')
        .send({ areaCodigo: 'AREA1' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/dashboard/data', () => {
    it('should return full access for Adm', async () => {
      const res = await request(app)
        .get('/api/dashboard/data')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.accessLevel).toBe('full');
      expect(res.body.perfil).toBe('Adm');
    });

    it('should return area-restricted access for Responsavel', async () => {
      const res = await request(app)
        .get('/api/dashboard/data')
        .set('Authorization', `Bearer ${responsavelToken}`);
      expect(res.status).toBe(200);
      expect(res.body.accessLevel).toBe('area');
      expect(res.body.selectedArea).toBe('AREA1');
    });

    it('should return readonly access for Plantonista', async () => {
      const res = await request(app)
        .get('/api/dashboard/data')
        .set('Authorization', `Bearer ${plantonistaToken}`);
      expect(res.status).toBe(200);
      expect(res.body.accessLevel).toBe('readonly');
      expect(res.body.selectedArea).toBe('AREA1');
    });

    it('should allow Adm to filter by area via header', async () => {
      const res = await request(app)
        .get('/api/dashboard/data')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('X-Selected-Area', 'AREA1');
      expect(res.status).toBe(200);
      expect(res.body.selectedArea).toBe('AREA1');
    });
  });

  describe('Role-based route protection', () => {
    it('should deny Plantonista from creating users', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${plantonistaToken}`)
        .send({
          codigo: 'NEW001',
          nome: 'New User',
          perfil: 'Plantonista',
          username: 'newuser',
          senha: 'pass123',
        });
      expect(res.status).toBe(403);
    });

    it('should deny Responsavel from creating users', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${responsavelToken}`)
        .send({
          codigo: 'NEW002',
          nome: 'New User 2',
          perfil: 'Plantonista',
          username: 'newuser2',
          senha: 'pass123',
        });
      expect(res.status).toBe(403);
    });

    it('should deny Plantonista from deleting areas', async () => {
      const areas = areaRepository.getAll();
      const res = await request(app)
        .delete(`/api/areas/${areas[0].id}`)
        .set('Authorization', `Bearer ${plantonistaToken}`);
      expect(res.status).toBe(403);
    });

    it('should deny Responsavel from creating areas', async () => {
      const res = await request(app)
        .post('/api/areas')
        .set('Authorization', `Bearer ${responsavelToken}`)
        .send({ codigo: 'AREA3', nome: 'Area 3' });
      expect(res.status).toBe(403);
    });

    it('should allow Adm to list users', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.users)).toBe(true);
    });

    it('should deny Plantonista from listing users', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${plantonistaToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Area-filtered data access', () => {
    it('should return all periodos for Adm', async () => {
      const res = await request(app)
        .get('/api/periodos')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    it('should return only AREA1 periodos for Responsavel of AREA1', async () => {
      const res = await request(app)
        .get('/api/periodos')
        .set('Authorization', `Bearer ${responsavelToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].areaCodigo).toBe('AREA1');
    });

    it('should return only AREA1 escalas for Plantonista of AREA1', async () => {
      const res = await request(app)
        .get('/api/escalas')
        .set('Authorization', `Bearer ${plantonistaToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].areaCodigo).toBe('AREA1');
    });

    it('should return all escalas for Adm', async () => {
      const res = await request(app)
        .get('/api/escalas')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(2);
    });

    it('should deny Responsavel from filtering by another area', async () => {
      const res = await request(app)
        .get('/api/periodos?areaCodigo=AREA2')
        .set('Authorization', `Bearer ${responsavelToken}`);
      expect(res.status).toBe(403);
    });

    it('should deny Plantonista from filtering escalas by another area', async () => {
      const res = await request(app)
        .get('/api/escalas?areaCodigo=AREA2')
        .set('Authorization', `Bearer ${plantonistaToken}`);
      expect(res.status).toBe(403);
    });

    it('should allow Adm to filter periodos by specific area', async () => {
      const res = await request(app)
        .get('/api/periodos?areaCodigo=AREA1')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].areaCodigo).toBe('AREA1');
    });
  });
});
