import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { AuthService, RegisterData, TokenPayload } from './auth';
import { createAuthMiddleware } from '../middleware/auth';
import express, { Request, Response } from 'express';
import request from 'supertest';

function createTestDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

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
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (area_codigo) REFERENCES areas(codigo)
    );
  `);

  return db;
}

describe('AuthService', () => {
  let db: Database.Database;
  let authService: AuthService;
  const TEST_SECRET = 'test-jwt-secret';

  beforeEach(() => {
    db = createTestDb();
    authService = new AuthService(db, TEST_SECRET);
  });

  afterEach(() => {
    db.close();
  });

  describe('register', () => {
    it('should register a new user with hashed password', async () => {
      const data: RegisterData = {
        codigo: 'USR001',
        nome: 'João Silva',
        perfil: 'Adm',
        cargo: 'Gerente',
        username: 'joao.silva',
        senha: 'senha123',
      };

      const result = await authService.register(data);

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user!.username).toBe('joao.silva');
      expect(result.user!.nome).toBe('João Silva');
      expect(result.user!.perfil).toBe('Adm');
      // Ensure senha_hash is not returned
      expect((result.user as any).senhaHash).toBeUndefined();
    });

    it('should store password as bcrypt hash, not plaintext', async () => {
      const data: RegisterData = {
        codigo: 'USR001',
        nome: 'João Silva',
        perfil: 'Adm',
        username: 'joao.silva',
        senha: 'senha123',
      };

      await authService.register(data);

      const row = db.prepare('SELECT senha_hash FROM users WHERE username = ?').get('joao.silva') as any;
      expect(row.senha_hash).not.toBe('senha123');
      expect(row.senha_hash).toMatch(/^\$2[aby]\$/); // bcrypt hash pattern
    });

    it('should reject duplicate username', async () => {
      const data: RegisterData = {
        codigo: 'USR001',
        nome: 'João Silva',
        perfil: 'Adm',
        username: 'joao.silva',
        senha: 'senha123',
      };

      await authService.register(data);

      const data2: RegisterData = {
        codigo: 'USR002',
        nome: 'Maria Santos',
        perfil: 'Plantonista',
        username: 'joao.silva',
        senha: 'outra123',
      };

      const result = await authService.register(data2);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Username já existe');
    });

    it('should reject duplicate codigo', async () => {
      const data: RegisterData = {
        codigo: 'USR001',
        nome: 'João Silva',
        perfil: 'Adm',
        username: 'joao.silva',
        senha: 'senha123',
      };

      await authService.register(data);

      const data2: RegisterData = {
        codigo: 'USR001',
        nome: 'Maria Santos',
        perfil: 'Plantonista',
        username: 'maria.santos',
        senha: 'outra123',
      };

      const result = await authService.register(data2);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Código já existe');
    });
  });

  describe('login', () => {
    beforeEach(async () => {
      await authService.register({
        codigo: 'USR001',
        areaCodigo: null,
        nome: 'João Silva',
        perfil: 'Adm',
        cargo: 'Gerente',
        username: 'joao.silva',
        senha: 'senha123',
      });
    });

    it('should return token on valid credentials', async () => {
      const result = await authService.login('joao.silva', 'senha123');

      expect(result.success).toBe(true);
      expect(result.token).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user!.username).toBe('joao.silva');
    });

    it('should return "Dados Incorretos!" for wrong password', async () => {
      const result = await authService.login('joao.silva', 'senhaErrada');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Dados Incorretos!');
      expect(result.token).toBeUndefined();
    });

    it('should return "Dados Incorretos!" for non-existent user', async () => {
      const result = await authService.login('usuario.inexistente', 'senha123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Dados Incorretos!');
      expect(result.token).toBeUndefined();
    });

    it('should include correct payload in token', async () => {
      const result = await authService.login('joao.silva', 'senha123');

      expect(result.success).toBe(true);
      const payload = authService.validateToken(result.token!);
      expect(payload).not.toBeNull();
      expect(payload!.username).toBe('joao.silva');
      expect(payload!.perfil).toBe('Adm');
      expect(payload!.userId).toBeDefined();
    });
  });

  describe('validateToken', () => {
    it('should return payload for valid token', async () => {
      await authService.register({
        codigo: 'USR001',
        nome: 'João Silva',
        perfil: 'Responsavel',
        username: 'joao.silva',
        senha: 'senha123',
      });

      const loginResult = await authService.login('joao.silva', 'senha123');
      const payload = authService.validateToken(loginResult.token!);

      expect(payload).not.toBeNull();
      expect(payload!.username).toBe('joao.silva');
      expect(payload!.perfil).toBe('Responsavel');
      expect(payload!.areaCodigo).toBeNull();
    });

    it('should return null for invalid token', () => {
      const payload = authService.validateToken('invalid.token.here');
      expect(payload).toBeNull();
    });

    it('should return null for expired token', () => {
      // Create a service with very short expiration to test
      const jwt = require('jsonwebtoken');
      const expiredToken = jwt.sign(
        { userId: 1, username: 'test', perfil: 'Adm', areaCodigo: null },
        TEST_SECRET,
        { expiresIn: '0s' }
      );

      // Wait a moment for the token to expire
      const payload = authService.validateToken(expiredToken);
      expect(payload).toBeNull();
    });

    it('should return null for token signed with different secret', () => {
      const jwt = require('jsonwebtoken');
      const wrongToken = jwt.sign(
        { userId: 1, username: 'test', perfil: 'Adm', areaCodigo: null },
        'wrong-secret',
        { expiresIn: '24h' }
      );

      const payload = authService.validateToken(wrongToken);
      expect(payload).toBeNull();
    });
  });
});

describe('authMiddleware', () => {
  let db: Database.Database;
  let authService: AuthService;
  let app: express.Express;
  const TEST_SECRET = 'test-jwt-secret';

  beforeEach(async () => {
    db = new Database(':memory:');
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
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
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (area_codigo) REFERENCES areas(codigo)
      );
    `);

    authService = new AuthService(db, TEST_SECRET);

    await authService.register({
      codigo: 'USR001',
      nome: 'Test User',
      perfil: 'Adm',
      username: 'testuser',
      senha: 'password123',
    });

    app = express();
    app.use(express.json());

    const middleware = createAuthMiddleware(authService);

    app.get('/protected', middleware, (req: Request, res: Response) => {
      res.json({ user: req.user, message: 'success' });
    });
  });

  afterEach(() => {
    db.close();
  });

  it('should return 401 when no Authorization header is provided', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token não fornecido');
  });

  it('should return 401 when Authorization header is not Bearer', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Basic abc123');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token não fornecido');
  });

  it('should return 401 when token is invalid', async () => {
    const res = await request(app)
      .get('/protected')
      .set('Authorization', 'Bearer invalid.token.here');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token inválido ou expirado');
  });

  it('should pass and attach user to request when token is valid', async () => {
    const loginResult = await authService.login('testuser', 'password123');

    const res = await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${loginResult.token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('success');
    expect(res.body.user.username).toBe('testuser');
    expect(res.body.user.perfil).toBe('Adm');
  });
});
