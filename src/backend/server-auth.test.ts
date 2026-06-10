import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Database from 'better-sqlite3';
import { createServer, ServerDependencies } from './server';
import { AuthService } from './services/auth';
import { UserRepository } from './database/repositories/UserRepository';
import { AreaRepository } from './database/repositories/AreaRepository';
import { PeriodoRepository } from './database/repositories/PeriodoRepository';
import { EscalaRepository } from './database/repositories/EscalaRepository';
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
      importSchedule: vi.fn(),
    } as any,
    teamRepository: {
      getAll: vi.fn().mockReturnValue([]),
      getById: vi.fn(),
      exists: vi.fn(),
    } as any,
  };
}

describe('Auth and CRUD API Routes', () => {
  let db: Database.Database;
  let app: Express;
  let authService: AuthService;
  let userRepository: UserRepository;
  let areaRepository: AreaRepository;
  let periodoRepository: PeriodoRepository;
  let escalaRepository: EscalaRepository;
  let adminToken: string;
  let userToken: string;

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

    // Create admin user
    const adminResult = await authService.register({
      codigo: 'ADM001',
      nome: 'Admin User',
      perfil: 'Adm',
      username: 'admin',
      senha: 'admin123',
    });
    const adminLogin = await authService.login('admin', 'admin123');
    adminToken = adminLogin.token!;

    // Create regular user
    const userResult = await authService.register({
      codigo: 'USR001',
      areaCodigo: 'AREA1',
      nome: 'Regular User',
      perfil: 'Plantonista',
      username: 'user1',
      senha: 'user123',
    });
    const userLogin = await authService.login('user1', 'user123');
    userToken = userLogin.token!;
  });

  describe('POST /api/auth/login', () => {
    it('should login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', senha: 'admin123' });
      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe('admin');
      expect(res.body.user.senhaHash).toBeUndefined();
    });

    it('should return 401 for invalid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin', senha: 'wrong' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Dados Incorretos!');
    });

    it('should return 400 for missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'admin' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('obrigatórios');
    });

    it('should return 401 for nonexistent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', senha: 'pass' });
      expect(res.status).toBe(401);
      expect(res.body.error).toBe('Dados Incorretos!');
    });
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          codigo: 'NEW001',
          nome: 'New User',
          perfil: 'Plantonista',
          username: 'newuser',
          senha: 'newpass',
        });
      expect(res.status).toBe(201);
      expect(res.body.user.username).toBe('newuser');
      expect(res.body.user.nome).toBe('New User');
    });

    it('should return 400 for duplicate username', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          codigo: 'DUP001',
          nome: 'Dup User',
          perfil: 'Plantonista',
          username: 'admin',
          senha: 'pass123',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Username já existe');
    });

    it('should return 400 for missing required fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ username: 'test' });
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('obrigatórios');
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user data', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('admin');
      expect(res.body.perfil).toBe('Adm');
      expect(res.body.senhaHash).toBeUndefined();
    });

    it('should return 401 without token', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalidtoken');
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/users', () => {
    it('should list users for admin', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      // Should not expose password hash
      res.body.forEach((u: any) => expect(u.senhaHash).toBeUndefined());
    });

    it('should return 403 for non-admin', async () => {
      const res = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/users', () => {
    it('should create user as admin', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          codigo: 'CRE001',
          nome: 'Created User',
          perfil: 'Responsavel',
          username: 'created',
          senha: 'pass123',
        });
      expect(res.status).toBe(201);
      expect(res.body.user.username).toBe('created');
    });

    it('should return 403 for non-admin', async () => {
      const res = await request(app)
        .post('/api/users')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          codigo: 'CRE002',
          nome: 'Blocked User',
          perfil: 'Plantonista',
          username: 'blocked',
          senha: 'pass123',
        });
      expect(res.status).toBe(403);
    });
  });

  describe('PUT /api/users/:id', () => {
    it('should update user', async () => {
      const users = userRepository.getAll();
      const target = users.find(u => u.username === 'user1')!;
      const res = await request(app)
        .put(`/api/users/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nome: 'Updated Name' });
      expect(res.status).toBe(200);
      expect(res.body.nome).toBe('Updated Name');
    });

    it('should return 404 for nonexistent user', async () => {
      const res = await request(app)
        .put('/api/users/9999')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nome: 'Nope' });
      expect(res.status).toBe(404);
    });

    it('should return 400 for invalid ID', async () => {
      const res = await request(app)
        .put('/api/users/abc')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ nome: 'Nope' });
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/users/:id', () => {
    it('should delete user as admin', async () => {
      const users = userRepository.getAll();
      const target = users.find(u => u.username === 'user1')!;
      const res = await request(app)
        .delete(`/api/users/${target.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(userRepository.getById(target.id)).toBeUndefined();
    });

    it('should return 403 for non-admin', async () => {
      const users = userRepository.getAll();
      const target = users[0];
      const res = await request(app)
        .delete(`/api/users/${target.id}`)
        .set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });

    it('should return 404 for nonexistent user', async () => {
      const res = await request(app)
        .delete('/api/users/9999')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Area CRUD Routes', () => {
    let areaId: number;

    beforeEach(() => {
      const area = areaRepository.create({ codigo: 'AREA1', nome: 'Area Test', torre: 'Torre A' });
      areaId = area.id;
    });

    describe('GET /api/areas', () => {
      it('should list areas for authenticated user', async () => {
        const res = await request(app)
          .get('/api/areas')
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
      });

      it('should return 401 without auth', async () => {
        const res = await request(app).get('/api/areas');
        expect(res.status).toBe(401);
      });
    });

    describe('POST /api/areas', () => {
      it('should create area as admin', async () => {
        const res = await request(app)
          .post('/api/areas')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ codigo: 'AREA2', nome: 'Nova Area', torre: 'Torre B' });
        expect(res.status).toBe(201);
        expect(res.body.codigo).toBe('AREA2');
        expect(res.body.nome).toBe('Nova Area');
      });

      it('should return 403 for non-admin', async () => {
        const res = await request(app)
          .post('/api/areas')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ codigo: 'AREA3', nome: 'Blocked Area' });
        expect(res.status).toBe(403);
      });

      it('should return 400 for missing fields', async () => {
        const res = await request(app)
          .post('/api/areas')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ codigo: 'AREA4' });
        expect(res.status).toBe(400);
      });
    });

    describe('PUT /api/areas/:id', () => {
      it('should update area', async () => {
        const res = await request(app)
          .put(`/api/areas/${areaId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ nome: 'Updated Area' });
        expect(res.status).toBe(200);
        expect(res.body.nome).toBe('Updated Area');
      });

      it('should return 404 for nonexistent area', async () => {
        const res = await request(app)
          .put('/api/areas/9999')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ nome: 'Nope' });
        expect(res.status).toBe(404);
      });
    });

    describe('DELETE /api/areas/:id', () => {
      it('should delete area as admin', async () => {
        const res = await request(app)
          .delete(`/api/areas/${areaId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('should return 403 for non-admin', async () => {
        const res = await request(app)
          .delete(`/api/areas/${areaId}`)
          .set('Authorization', `Bearer ${userToken}`);
        expect(res.status).toBe(403);
      });
    });
  });

  describe('Periodo CRUD Routes', () => {
    let periodoId: number;

    beforeEach(() => {
      areaRepository.create({ codigo: 'PER_AREA', nome: 'Area Periodo', torre: null });
      const periodo = periodoRepository.create({
        codigo: 'PER001',
        data: '2024-01-15',
        horarios: '08:00-16:00',
        areaCodigo: 'PER_AREA',
      });
      periodoId = periodo.id;
    });

    describe('GET /api/periodos', () => {
      it('should list all periodos', async () => {
        const res = await request(app)
          .get('/api/periodos')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
      });

      it('should filter periodos by areaCodigo', async () => {
        const res = await request(app)
          .get('/api/periodos?areaCodigo=PER_AREA')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        expect(res.body[0].areaCodigo).toBe('PER_AREA');
      });
    });

    describe('POST /api/periodos', () => {
      it('should create periodo', async () => {
        const res = await request(app)
          .post('/api/periodos')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ codigo: 'PER002', data: '2024-01-16', horarios: '16:00-00:00', areaCodigo: 'PER_AREA' });
        expect(res.status).toBe(201);
        expect(res.body.codigo).toBe('PER002');
      });

      it('should return 400 for missing fields', async () => {
        const res = await request(app)
          .post('/api/periodos')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ codigo: 'PER003' });
        expect(res.status).toBe(400);
      });
    });

    describe('PUT /api/periodos/:id', () => {
      it('should update periodo', async () => {
        const res = await request(app)
          .put(`/api/periodos/${periodoId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ horarios: '09:00-17:00' });
        expect(res.status).toBe(200);
        expect(res.body.horarios).toBe('09:00-17:00');
      });

      it('should return 404 for nonexistent periodo', async () => {
        const res = await request(app)
          .put('/api/periodos/9999')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ horarios: '10:00-18:00' });
        expect(res.status).toBe(404);
      });
    });

    describe('DELETE /api/periodos/:id', () => {
      it('should delete periodo', async () => {
        const res = await request(app)
          .delete(`/api/periodos/${periodoId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('should return 404 for nonexistent periodo', async () => {
        const res = await request(app)
          .delete('/api/periodos/9999')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
      });
    });
  });

  describe('Escala CRUD Routes', () => {
    let escalaId: number;

    beforeEach(() => {
      areaRepository.create({ codigo: 'ESC_AREA', nome: 'Area Escala', torre: null });
      periodoRepository.create({ codigo: 'ESC_PER', data: '2024-01-15', horarios: '08:00-16:00', areaCodigo: 'ESC_AREA' });
      const escala = escalaRepository.create({
        codigo: 'ESC001',
        areaCodigo: 'ESC_AREA',
        periodoCodigo: 'ESC_PER',
        usuarioCodigo: 'USR001',
      });
      escalaId = escala.id;
    });

    describe('GET /api/escalas', () => {
      it('should list all escalas', async () => {
        const res = await request(app)
          .get('/api/escalas')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
        expect(res.body.length).toBeGreaterThanOrEqual(1);
      });

      it('should filter escalas by areaCodigo', async () => {
        const res = await request(app)
          .get('/api/escalas?areaCodigo=ESC_AREA')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.length).toBe(1);
        expect(res.body[0].areaCodigo).toBe('ESC_AREA');
      });
    });

    describe('POST /api/escalas', () => {
      it('should create escala', async () => {
        const res = await request(app)
          .post('/api/escalas')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ codigo: 'ESC002', areaCodigo: 'ESC_AREA', periodoCodigo: 'ESC_PER', usuarioCodigo: 'ADM001' });
        expect(res.status).toBe(201);
        expect(res.body.codigo).toBe('ESC002');
      });

      it('should return 400 for missing fields', async () => {
        const res = await request(app)
          .post('/api/escalas')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ codigo: 'ESC003' });
        expect(res.status).toBe(400);
      });
    });

    describe('PUT /api/escalas/:id', () => {
      it('should update escala', async () => {
        const res = await request(app)
          .put(`/api/escalas/${escalaId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ usuarioCodigo: 'ADM001' });
        expect(res.status).toBe(200);
        expect(res.body.usuarioCodigo).toBe('ADM001');
      });

      it('should return 404 for nonexistent escala', async () => {
        const res = await request(app)
          .put('/api/escalas/9999')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ usuarioCodigo: 'ADM001' });
        expect(res.status).toBe(404);
      });
    });

    describe('DELETE /api/escalas/:id', () => {
      it('should delete escala', async () => {
        const res = await request(app)
          .delete(`/api/escalas/${escalaId}`)
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
      });

      it('should return 404 for nonexistent escala', async () => {
        const res = await request(app)
          .delete('/api/escalas/9999')
          .set('Authorization', `Bearer ${adminToken}`);
        expect(res.status).toBe(404);
      });
    });
  });
});
