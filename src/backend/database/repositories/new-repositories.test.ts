import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../init';
import { UserRepository } from './UserRepository';
import { AreaRepository } from './AreaRepository';
import { PeriodoRepository } from './PeriodoRepository';
import { EscalaRepository } from './EscalaRepository';

function createTestDb(): Database.Database {
  return initializeDatabase(':memory:');
}

describe('AreaRepository', () => {
  let db: Database.Database;
  let repo: AreaRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new AreaRepository(db);
  });

  it('creates and retrieves an area by id', () => {
    const area = repo.create({ codigo: 'AREA-01', nome: 'Infraestrutura', torre: 'Torre A' });
    expect(area.id).toBeDefined();
    expect(area.codigo).toBe('AREA-01');
    expect(area.nome).toBe('Infraestrutura');
    expect(area.torre).toBe('Torre A');
    expect(area.createdAt).toBeDefined();

    const found = repo.getById(area.id);
    expect(found).toBeDefined();
    expect(found!.codigo).toBe('AREA-01');
  });

  it('retrieves area by codigo', () => {
    repo.create({ codigo: 'AREA-02', nome: 'Aplicações', torre: null });
    const found = repo.getByCodigo('AREA-02');
    expect(found).toBeDefined();
    expect(found!.nome).toBe('Aplicações');
    expect(found!.torre).toBeNull();
  });

  it('returns undefined for non-existent area', () => {
    expect(repo.getById(999)).toBeUndefined();
    expect(repo.getByCodigo('FAKE')).toBeUndefined();
  });

  it('gets all areas ordered by name', () => {
    // DB already has seed areas; add 3 more and verify they are included
    const seedCount = repo.getAll().length;
    repo.create({ codigo: 'B', nome: 'Beta', torre: null });
    repo.create({ codigo: 'A', nome: 'Alpha', torre: null });
    repo.create({ codigo: 'C', nome: 'Charlie', torre: null });

    const all = repo.getAll();
    expect(all).toHaveLength(seedCount + 3);
    const names = all.map(a => a.nome);
    expect(names).toContain('Alpha');
    expect(names).toContain('Beta');
    expect(names).toContain('Charlie');
    // Verify sorted alphabetically (SQLite ORDER BY nome)
    const sorted = [...names].sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
    expect(names).toEqual(sorted);
  });

  it('updates an area', () => {
    const area = repo.create({ codigo: 'AREA-01', nome: 'Old Name', torre: 'Torre A' });
    const updated = repo.update(area.id, { nome: 'New Name', torre: 'Torre B' });
    expect(updated!.nome).toBe('New Name');
    expect(updated!.torre).toBe('Torre B');
    expect(updated!.codigo).toBe('AREA-01');
  });

  it('update with no fields returns area unchanged', () => {
    const area = repo.create({ codigo: 'AREA-01', nome: 'Name', torre: null });
    const unchanged = repo.update(area.id, {});
    expect(unchanged!.nome).toBe('Name');
  });

  it('deletes an area', () => {
    const area = repo.create({ codigo: 'AREA-01', nome: 'To Delete', torre: null });
    expect(repo.delete(area.id)).toBe(true);
    expect(repo.getById(area.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent area', () => {
    expect(repo.delete(999)).toBe(false);
  });

  it('enforces unique codigo', () => {
    repo.create({ codigo: 'AREA-01', nome: 'First', torre: null });
    expect(() => repo.create({ codigo: 'AREA-01', nome: 'Duplicate', torre: null })).toThrow();
  });
});

describe('UserRepository', () => {
  let db: Database.Database;
  let repo: UserRepository;
  let areaRepo: AreaRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new UserRepository(db);
    areaRepo = new AreaRepository(db);
    // Create an area for FK reference
    areaRepo.create({ codigo: 'AREA-01', nome: 'Infra', torre: null });
  });

  it('creates and retrieves a user by id', () => {
    const user = repo.create({
      codigo: 'USR-001',
      areaCodigo: 'AREA-01',
      nome: 'João Silva',
      perfil: 'Adm',
      cargo: 'Gerente',
      username: 'joao.silva',
      senhaHash: 'hashed123',
    });
    expect(user.id).toBeDefined();
    expect(user.codigo).toBe('USR-001');
    expect(user.areaCodigo).toBe('AREA-01');
    expect(user.nome).toBe('João Silva');
    expect(user.perfil).toBe('Adm');
    expect(user.cargo).toBe('Gerente');
    expect(user.username).toBe('joao.silva');

    const found = repo.getById(user.id);
    expect(found).toBeDefined();
    expect(found!.username).toBe('joao.silva');
  });

  it('retrieves user by username', () => {
    repo.create({
      codigo: 'USR-001',
      areaCodigo: 'AREA-01',
      nome: 'Alice',
      perfil: 'Plantonista',
      cargo: null,
      username: 'alice',
      senhaHash: 'hash',
    });

    const found = repo.getByUsername('alice');
    expect(found).toBeDefined();
    expect(found!.nome).toBe('Alice');
  });

  it('returns undefined for non-existent username', () => {
    expect(repo.getByUsername('ghost')).toBeUndefined();
  });

  it('retrieves users by area', () => {
    areaRepo.create({ codigo: 'AREA-02', nome: 'Apps', torre: null });
    repo.create({ codigo: 'U1', areaCodigo: 'AREA-01', nome: 'User1', perfil: 'Plantonista', cargo: null, username: 'u1', senhaHash: 'h' });
    repo.create({ codigo: 'U2', areaCodigo: 'AREA-01', nome: 'User2', perfil: 'Plantonista', cargo: null, username: 'u2', senhaHash: 'h' });
    repo.create({ codigo: 'U3', areaCodigo: 'AREA-02', nome: 'User3', perfil: 'Responsavel', cargo: null, username: 'u3', senhaHash: 'h' });

    const area01Users = repo.getByArea('AREA-01');
    expect(area01Users).toHaveLength(2);
    expect(area01Users.map(u => u.codigo).sort()).toEqual(['U1', 'U2']);
  });

  it('creates user without area (null areaCodigo)', () => {
    const user = repo.create({
      codigo: 'USR-ADM',
      areaCodigo: null,
      nome: 'Admin Geral',
      perfil: 'Adm',
      cargo: 'Admin',
      username: 'admin',
      senhaHash: 'hash',
    });
    expect(user.areaCodigo).toBeNull();
  });

  it('updates a user', () => {
    const user = repo.create({ codigo: 'U1', areaCodigo: 'AREA-01', nome: 'Old', perfil: 'Plantonista', cargo: null, username: 'u1', senhaHash: 'h' });
    const updated = repo.update(user.id, { nome: 'New Name', cargo: 'Engenheiro' });
    expect(updated!.nome).toBe('New Name');
    expect(updated!.cargo).toBe('Engenheiro');
    expect(updated!.perfil).toBe('Plantonista');
  });

  it('deletes a user', () => {
    const user = repo.create({ codigo: 'U1', areaCodigo: 'AREA-01', nome: 'ToDelete', perfil: 'Plantonista', cargo: null, username: 'u1', senhaHash: 'h' });
    expect(repo.delete(user.id)).toBe(true);
    expect(repo.getById(user.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent user', () => {
    expect(repo.delete(999)).toBe(false);
  });

  it('enforces unique username', () => {
    repo.create({ codigo: 'U1', areaCodigo: 'AREA-01', nome: 'User1', perfil: 'Plantonista', cargo: null, username: 'same', senhaHash: 'h' });
    expect(() => repo.create({ codigo: 'U2', areaCodigo: 'AREA-01', nome: 'User2', perfil: 'Plantonista', cargo: null, username: 'same', senhaHash: 'h' })).toThrow();
  });

  it('enforces unique codigo', () => {
    repo.create({ codigo: 'U1', areaCodigo: 'AREA-01', nome: 'User1', perfil: 'Plantonista', cargo: null, username: 'u1', senhaHash: 'h' });
    expect(() => repo.create({ codigo: 'U1', areaCodigo: 'AREA-01', nome: 'User2', perfil: 'Plantonista', cargo: null, username: 'u2', senhaHash: 'h' })).toThrow();
  });
});

describe('PeriodoRepository', () => {
  let db: Database.Database;
  let repo: PeriodoRepository;
  let areaRepo: AreaRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new PeriodoRepository(db);
    areaRepo = new AreaRepository(db);
    areaRepo.create({ codigo: 'AREA-01', nome: 'Infra', torre: null });
    areaRepo.create({ codigo: 'AREA-02', nome: 'Apps', torre: null });
  });

  it('creates and retrieves a periodo by id', () => {
    const periodo = repo.create({
      codigo: 'PER-001',
      data: '2024-03-15',
      horarios: '08:00-16:00',
      areaCodigo: 'AREA-01',
    });
    expect(periodo.id).toBeDefined();
    expect(periodo.codigo).toBe('PER-001');
    expect(periodo.data).toBe('2024-03-15');
    expect(periodo.horarios).toBe('08:00-16:00');
    expect(periodo.areaCodigo).toBe('AREA-01');

    const found = repo.getById(periodo.id);
    expect(found).toBeDefined();
    expect(found!.codigo).toBe('PER-001');
  });

  it('retrieves periodo by codigo', () => {
    repo.create({ codigo: 'PER-001', data: '2024-03-15', horarios: '08:00-16:00', areaCodigo: 'AREA-01' });
    const found = repo.getByCodigo('PER-001');
    expect(found).toBeDefined();
    expect(found!.data).toBe('2024-03-15');
  });

  it('returns undefined for non-existent periodo', () => {
    expect(repo.getById(999)).toBeUndefined();
    expect(repo.getByCodigo('FAKE')).toBeUndefined();
  });

  it('retrieves periodos by area ordered by date', () => {
    repo.create({ codigo: 'P2', data: '2024-03-20', horarios: '08:00-16:00', areaCodigo: 'AREA-01' });
    repo.create({ codigo: 'P1', data: '2024-03-10', horarios: '16:00-00:00', areaCodigo: 'AREA-01' });
    repo.create({ codigo: 'P3', data: '2024-03-25', horarios: '08:00-16:00', areaCodigo: 'AREA-02' });

    const area01 = repo.getByArea('AREA-01');
    expect(area01).toHaveLength(2);
    expect(area01[0].data).toBe('2024-03-10');
    expect(area01[1].data).toBe('2024-03-20');
  });

  it('updates a periodo', () => {
    const periodo = repo.create({ codigo: 'PER-001', data: '2024-03-15', horarios: '08:00-16:00', areaCodigo: 'AREA-01' });
    const updated = repo.update(periodo.id, { horarios: '06:00-14:00', data: '2024-03-16' });
    expect(updated!.horarios).toBe('06:00-14:00');
    expect(updated!.data).toBe('2024-03-16');
    expect(updated!.codigo).toBe('PER-001');
  });

  it('deletes a periodo', () => {
    const periodo = repo.create({ codigo: 'PER-001', data: '2024-03-15', horarios: '08:00-16:00', areaCodigo: 'AREA-01' });
    expect(repo.delete(periodo.id)).toBe(true);
    expect(repo.getById(periodo.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent periodo', () => {
    expect(repo.delete(999)).toBe(false);
  });

  it('deletes a periodo by id using deleteById', () => {
    const periodo = repo.create({ codigo: 'PER-002', data: '2024-04-01', horarios: '08:00-16:00', areaCodigo: 'AREA-01' });
    expect(repo.deleteById(periodo.id)).toBe(true);
    expect(repo.getById(periodo.id)).toBeUndefined();
  });

  it('returns false when deleteById targets non-existent periodo', () => {
    expect(repo.deleteById(999)).toBe(false);
  });

  it('enforces unique codigo', () => {
    repo.create({ codigo: 'PER-001', data: '2024-03-15', horarios: '08:00-16:00', areaCodigo: 'AREA-01' });
    expect(() => repo.create({ codigo: 'PER-001', data: '2024-03-16', horarios: '08:00-16:00', areaCodigo: 'AREA-01' })).toThrow();
  });
});

describe('EscalaRepository', () => {
  let db: Database.Database;
  let repo: EscalaRepository;
  let areaRepo: AreaRepository;
  let periodoRepo: PeriodoRepository;
  let userRepo: UserRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new EscalaRepository(db);
    areaRepo = new AreaRepository(db);
    periodoRepo = new PeriodoRepository(db);
    userRepo = new UserRepository(db);

    // Setup referential data
    areaRepo.create({ codigo: 'AREA-01', nome: 'Infra', torre: null });
    areaRepo.create({ codigo: 'AREA-02', nome: 'Apps', torre: null });
    periodoRepo.create({ codigo: 'PER-001', data: '2024-03-15', horarios: '08:00-16:00', areaCodigo: 'AREA-01' });
    periodoRepo.create({ codigo: 'PER-002', data: '2024-03-16', horarios: '16:00-00:00', areaCodigo: 'AREA-01' });
    periodoRepo.create({ codigo: 'PER-003', data: '2024-03-15', horarios: '08:00-16:00', areaCodigo: 'AREA-02' });
    userRepo.create({ codigo: 'USR-001', areaCodigo: 'AREA-01', nome: 'Alice', perfil: 'Plantonista', cargo: null, username: 'alice', senhaHash: 'h' });
    userRepo.create({ codigo: 'USR-002', areaCodigo: 'AREA-01', nome: 'Bob', perfil: 'Plantonista', cargo: null, username: 'bob', senhaHash: 'h' });
    userRepo.create({ codigo: 'USR-003', areaCodigo: 'AREA-02', nome: 'Charlie', perfil: 'Plantonista', cargo: null, username: 'charlie', senhaHash: 'h' });
  });

  it('creates and retrieves an escala by id', () => {
    const escala = repo.create({
      codigo: 'ESC-001',
      areaCodigo: 'AREA-01',
      periodoCodigo: 'PER-001',
      usuarioCodigo: 'USR-001',
    });
    expect(escala.id).toBeDefined();
    expect(escala.codigo).toBe('ESC-001');
    expect(escala.areaCodigo).toBe('AREA-01');
    expect(escala.periodoCodigo).toBe('PER-001');
    expect(escala.usuarioCodigo).toBe('USR-001');
    expect(escala.createdAt).toBeDefined();

    const found = repo.getById(escala.id);
    expect(found).toBeDefined();
    expect(found!.codigo).toBe('ESC-001');
  });

  it('returns undefined for non-existent escala', () => {
    expect(repo.getById(999)).toBeUndefined();
  });

  it('retrieves escalas by area', () => {
    repo.create({ codigo: 'ESC-001', areaCodigo: 'AREA-01', periodoCodigo: 'PER-001', usuarioCodigo: 'USR-001' });
    repo.create({ codigo: 'ESC-002', areaCodigo: 'AREA-01', periodoCodigo: 'PER-002', usuarioCodigo: 'USR-002' });
    repo.create({ codigo: 'ESC-003', areaCodigo: 'AREA-02', periodoCodigo: 'PER-003', usuarioCodigo: 'USR-003' });

    const area01 = repo.getByArea('AREA-01');
    expect(area01).toHaveLength(2);
    expect(area01.map(e => e.codigo).sort()).toEqual(['ESC-001', 'ESC-002']);
  });

  it('retrieves escalas by periodo', () => {
    repo.create({ codigo: 'ESC-001', areaCodigo: 'AREA-01', periodoCodigo: 'PER-001', usuarioCodigo: 'USR-001' });
    repo.create({ codigo: 'ESC-002', areaCodigo: 'AREA-01', periodoCodigo: 'PER-001', usuarioCodigo: 'USR-002' });
    repo.create({ codigo: 'ESC-003', areaCodigo: 'AREA-01', periodoCodigo: 'PER-002', usuarioCodigo: 'USR-001' });

    const per001 = repo.getByPeriodo('PER-001');
    expect(per001).toHaveLength(2);
  });

  it('retrieves escalas by usuario', () => {
    repo.create({ codigo: 'ESC-001', areaCodigo: 'AREA-01', periodoCodigo: 'PER-001', usuarioCodigo: 'USR-001' });
    repo.create({ codigo: 'ESC-002', areaCodigo: 'AREA-01', periodoCodigo: 'PER-002', usuarioCodigo: 'USR-001' });
    repo.create({ codigo: 'ESC-003', areaCodigo: 'AREA-02', periodoCodigo: 'PER-003', usuarioCodigo: 'USR-003' });

    const usr001 = repo.getByUsuario('USR-001');
    expect(usr001).toHaveLength(2);
  });

  it('deletes an escala', () => {
    const escala = repo.create({ codigo: 'ESC-001', areaCodigo: 'AREA-01', periodoCodigo: 'PER-001', usuarioCodigo: 'USR-001' });
    expect(repo.delete(escala.id)).toBe(true);
    expect(repo.getById(escala.id)).toBeUndefined();
  });

  it('returns false when deleting non-existent escala', () => {
    expect(repo.delete(999)).toBe(false);
  });

  it('enforces unique codigo', () => {
    repo.create({ codigo: 'ESC-001', areaCodigo: 'AREA-01', periodoCodigo: 'PER-001', usuarioCodigo: 'USR-001' });
    expect(() => repo.create({ codigo: 'ESC-001', areaCodigo: 'AREA-01', periodoCodigo: 'PER-002', usuarioCodigo: 'USR-002' })).toThrow();
  });

  it('enforces foreign key on area_codigo', () => {
    expect(() => repo.create({ codigo: 'ESC-BAD', areaCodigo: 'FAKE-AREA', periodoCodigo: 'PER-001', usuarioCodigo: 'USR-001' })).toThrow();
  });

  it('enforces foreign key on periodo_codigo', () => {
    expect(() => repo.create({ codigo: 'ESC-BAD', areaCodigo: 'AREA-01', periodoCodigo: 'FAKE-PER', usuarioCodigo: 'USR-001' })).toThrow();
  });

  it('enforces foreign key on usuario_codigo', () => {
    expect(() => repo.create({ codigo: 'ESC-BAD', areaCodigo: 'AREA-01', periodoCodigo: 'PER-001', usuarioCodigo: 'FAKE-USR' })).toThrow();
  });
});
