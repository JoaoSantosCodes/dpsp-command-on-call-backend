import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
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
  areaSolicitada?: string | null;
  nome: string;
  perfil: UserPerfil;
  nivelEscalonamento?: string | null;
  cargo?: string | null;
  contato?: string | null;
  username: string;
  senha: string;
  aprovado?: boolean;
}

export interface AuthResult {
  success: boolean;
  token?: string;
  user?: Omit<User, 'senhaHash'>;
  error?: string;
}

export class AuthService {
  private db: Pool;
  private jwtSecret: string;

  constructor(db: Pool, jwtSecret: string) {
    if (!jwtSecret) {
      throw new Error('JWT secret is required for AuthService');
    }
    this.db = db;
    this.jwtSecret = jwtSecret;
  }

  async login(username: string, senha: string): Promise<AuthResult> {
    const res = await this.db.query(
      'SELECT * FROM users WHERE username = $1',
      [username]
    );
    const row = res.rows[0];

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
      areaSolicitada: row.area_solicitada || null,
      nome: row.nome,
      perfil: row.perfil,
      nivelEscalonamento: row.nivel_escalonamento || null,
      cargo: row.cargo,
      contato: row.contato || null,
      username: row.username,
      ativo: row.ativo !== 0,
      aprovado: row.aprovado !== 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    return { success: true, token, user };
  }

  async register(data: RegisterData): Promise<AuthResult> {
    // Check if username already exists
    let res = await this.db.query(
      'SELECT id FROM users WHERE username = $1',
      [data.username]
    );
    if (res.rows.length > 0) {
      return { success: false, error: 'Username já existe' };
    }

    // Check if codigo already exists
    res = await this.db.query(
      'SELECT id FROM users WHERE codigo = $1',
      [data.codigo]
    );
    if (res.rows.length > 0) {
      return { success: false, error: 'Código já existe' };
    }

    const senhaHash = await bcrypt.hash(data.senha, SALT_ROUNDS);

    res = await this.db.query(`
      INSERT INTO users (codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11)
      RETURNING *
    `, [
      data.codigo,
      data.areaCodigo || null,
      data.areaSolicitada || null,
      data.nome,
      data.perfil,
      data.nivelEscalonamento || null,
      data.cargo || null,
      data.contato || null,
      data.username,
      senhaHash,
      data.aprovado !== undefined ? (data.aprovado ? 1 : 0) : 1
    ]);

    const row = res.rows[0];

    const user: Omit<User, 'senhaHash'> = {
      id: row.id,
      codigo: row.codigo,
      areaCodigo: row.area_codigo,
      areaSolicitada: row.area_solicitada || null,
      nome: row.nome,
      perfil: row.perfil,
      nivelEscalonamento: row.nivel_escalonamento || null,
      cargo: row.cargo,
      contato: row.contato || null,
      username: row.username,
      ativo: row.ativo !== 0,
      aprovado: row.aprovado !== 0,
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
