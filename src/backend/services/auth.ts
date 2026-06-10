import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import Database from 'better-sqlite3';
import { User, UserPerfil } from '../../shared/types';

const SALT_ROUNDS = 10;
const TOKEN_EXPIRATION = '24h';

export interface TokenPayload {
  userId: number;
  username: string;
  perfil: UserPerfil;
  areaCodigo: string | null;
}

export interface RegisterData {
  codigo: string;
  areaCodigo?: string | null;
  nome: string;
  perfil: UserPerfil;
  cargo?: string | null;
  username: string;
  senha: string;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  user?: Omit<User, 'senhaHash'>;
  error?: string;
}

export class AuthService {
  private db: Database.Database;
  private jwtSecret: string;

  constructor(db: Database.Database, jwtSecret: string) {
    if (!jwtSecret) {
      throw new Error('JWT secret is required for AuthService');
    }
    this.db = db;
    this.jwtSecret = jwtSecret;
  }

  async login(username: string, senha: string): Promise<AuthResult> {
    const row = this.db.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).get(username) as any | undefined;

    if (!row) {
      return { success: false, error: 'Dados Incorretos!' };
    }

    const passwordMatch = await bcrypt.compare(senha, row.senha_hash);
    if (!passwordMatch) {
      return { success: false, error: 'Dados Incorretos!' };
    }

    const payload: TokenPayload = {
      userId: row.id,
      username: row.username,
      perfil: row.perfil,
      areaCodigo: row.area_codigo,
    };

    const token = jwt.sign(payload, this.jwtSecret, { expiresIn: TOKEN_EXPIRATION });

    const user: Omit<User, 'senhaHash'> = {
      id: row.id,
      codigo: row.codigo,
      areaCodigo: row.area_codigo,
      nome: row.nome,
      perfil: row.perfil,
      cargo: row.cargo,
      username: row.username,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return { success: true, token, user };
  }

  async register(data: RegisterData): Promise<AuthResult> {
    // Check if username already exists
    const existing = this.db.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).get(data.username) as any | undefined;

    if (existing) {
      return { success: false, error: 'Username já existe' };
    }

    // Check if codigo already exists
    const existingCodigo = this.db.prepare(
      'SELECT id FROM users WHERE codigo = ?'
    ).get(data.codigo) as any | undefined;

    if (existingCodigo) {
      return { success: false, error: 'Código já existe' };
    }

    const senhaHash = await bcrypt.hash(data.senha, SALT_ROUNDS);

    const stmt = this.db.prepare(`
      INSERT INTO users (codigo, area_codigo, nome, perfil, cargo, username, senha_hash)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.codigo,
      data.areaCodigo || null,
      data.nome,
      data.perfil,
      data.cargo || null,
      data.username,
      senhaHash
    );

    const row = this.db.prepare(
      'SELECT * FROM users WHERE id = ?'
    ).get(result.lastInsertRowid) as any;

    const user: Omit<User, 'senhaHash'> = {
      id: row.id,
      codigo: row.codigo,
      areaCodigo: row.area_codigo,
      nome: row.nome,
      perfil: row.perfil,
      cargo: row.cargo,
      username: row.username,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return { success: true, user };
  }

  validateToken(token: string): TokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.jwtSecret) as TokenPayload;
      return decoded;
    } catch {
      return null;
    }
  }
}
