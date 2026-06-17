import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../database/init';
import { UserRepository } from '../database/repositories/UserRepository';
import { AreaRepository } from '../database/repositories/AreaRepository';
import { resolveAreaFallback } from './dashboard-fallback';

function createTestDb(): Database.Database {
  return initializeDatabase(':memory:');
}

describe('resolveAreaFallback', () => {
  let db: Database.Database;
  let userRepo: UserRepository;
  let areaRepo: AreaRepository;

  beforeEach(() => {
    db = createTestDb();
    userRepo = new UserRepository(db);
    areaRepo = new AreaRepository(db);
  });

  // Requirement 5.1 — area-level fallback
  it('returns area-scope fallback with all Command users in the area (Req 5.1)', () => {
    areaRepo.create({ codigo: 'AREA-01', nome: 'Infra', torre: null });
    userRepo.create({ codigo: 'U1', areaCodigo: 'AREA-01', nome: 'Alice', perfil: 'Plantonista', cargo: 'Analista', username: 'alice', senhaHash: 'h' });
    userRepo.create({ codigo: 'U2', areaCodigo: 'AREA-01', nome: 'Bob', perfil: 'Plantonista', cargo: null, username: 'bob', senhaHash: 'h' });
    // Non-Command user should not appear in fallback
    userRepo.create({ codigo: 'R1', areaCodigo: 'AREA-01', nome: 'ResponsavelX', perfil: 'Responsavel', cargo: null, username: 'resp', senhaHash: 'h' });

    const result = resolveAreaFallback('AREA-01', userRepo, areaRepo);

    expect(result.isFallback).toBe(true);
    expect(result.fallbackScope).toBe('area');
    expect(result.torre).toBeNull();
    expect(result.contacts).toHaveLength(2);
    const names = result.contacts.map(c => c.nome).sort();
    expect(names).toEqual(['Alice', 'Bob']);
  });

  // Requirement 5.2 — torre-level fallback when no command users in the direct area
  it('widens to torre scope when area has no Command users but torre has some (Req 5.2)', () => {
    areaRepo.create({ codigo: 'AREA-01', nome: 'Infra', torre: 'Torre A' });
    areaRepo.create({ codigo: 'AREA-02', nome: 'Apps', torre: 'Torre A' });
    areaRepo.create({ codigo: 'AREA-03', nome: 'DB', torre: 'Torre B' });

    // No Command users in AREA-01
    userRepo.create({ codigo: 'R1', areaCodigo: 'AREA-01', nome: 'Resp1', perfil: 'Responsavel', cargo: null, username: 'resp1', senhaHash: 'h' });

    // Command users in AREA-02 (same torre as AREA-01)
    userRepo.create({ codigo: 'U1', areaCodigo: 'AREA-02', nome: 'Charlie', perfil: 'Plantonista', cargo: 'Dev', username: 'charlie', senhaHash: 'h' });
    userRepo.create({ codigo: 'U2', areaCodigo: 'AREA-02', nome: 'Diana', perfil: 'Plantonista', cargo: null, username: 'diana', senhaHash: 'h' });

    // Command users in AREA-03 (different torre — should not appear)
    userRepo.create({ codigo: 'U3', areaCodigo: 'AREA-03', nome: 'Eve', perfil: 'Plantonista', cargo: null, username: 'eve', senhaHash: 'h' });

    const result = resolveAreaFallback('AREA-01', userRepo, areaRepo);

    expect(result.isFallback).toBe(true);
    expect(result.fallbackScope).toBe('torre');
    expect(result.torre).toBe('Torre A');
    expect(result.contacts).toHaveLength(2);
    const names = result.contacts.map(c => c.nome).sort();
    expect(names).toEqual(['Charlie', 'Diana']);
  });

  it('area-scope takes precedence over torre-scope when area has Command users', () => {
    areaRepo.create({ codigo: 'AREA-01', nome: 'Infra', torre: 'Torre X' });
    areaRepo.create({ codigo: 'AREA-02', nome: 'Apps', torre: 'Torre X' });

    // Command user in AREA-01 directly
    userRepo.create({ codigo: 'U1', areaCodigo: 'AREA-01', nome: 'LocalUser', perfil: 'Plantonista', cargo: null, username: 'local', senhaHash: 'h' });
    // Command user in AREA-02 (same torre)
    userRepo.create({ codigo: 'U2', areaCodigo: 'AREA-02', nome: 'TorreUser', perfil: 'Plantonista', cargo: null, username: 'torre', senhaHash: 'h' });

    const result = resolveAreaFallback('AREA-01', userRepo, areaRepo);

    expect(result.fallbackScope).toBe('area');
    expect(result.contacts).toHaveLength(1);
    expect(result.contacts[0].nome).toBe('LocalUser');
  });

  it('returns none scope when area exists but no Command users anywhere in torre', () => {
    areaRepo.create({ codigo: 'AREA-01', nome: 'Infra', torre: 'Torre Z' });
    areaRepo.create({ codigo: 'AREA-99', nome: 'Shared', torre: 'Torre Z' });

    // Only non-Command users
    userRepo.create({ codigo: 'R1', areaCodigo: 'AREA-01', nome: 'Resp1', perfil: 'Responsavel', cargo: null, username: 'resp1', senhaHash: 'h' });
    userRepo.create({ codigo: 'A1', areaCodigo: 'AREA-99', nome: 'Adm1', perfil: 'Adm', cargo: null, username: 'adm1', senhaHash: 'h' });

    const result = resolveAreaFallback('AREA-01', userRepo, areaRepo);

    expect(result.isFallback).toBe(true);
    expect(result.fallbackScope).toBe('none');
    expect(result.contacts).toHaveLength(0);
  });

  it('returns none scope when area has no torre and no Command users', () => {
    areaRepo.create({ codigo: 'AREA-01', nome: 'Infra', torre: null });
    userRepo.create({ codigo: 'R1', areaCodigo: 'AREA-01', nome: 'Resp1', perfil: 'Responsavel', cargo: null, username: 'resp1', senhaHash: 'h' });

    const result = resolveAreaFallback('AREA-01', userRepo, areaRepo);

    expect(result.isFallback).toBe(true);
    expect(result.fallbackScope).toBe('none');
    expect(result.torre).toBeNull();
    expect(result.contacts).toHaveLength(0);
  });

  it('returns none scope for unknown area', () => {
    const result = resolveAreaFallback('UNKNOWN', userRepo, areaRepo);
    expect(result.fallbackScope).toBe('none');
    expect(result.contacts).toHaveLength(0);
    expect(result.isFallback).toBe(true);
  });

  it('contact objects contain the expected fields', () => {
    areaRepo.create({ codigo: 'AREA-01', nome: 'Infraestrutura', torre: null });
    userRepo.create({ codigo: 'U1', areaCodigo: 'AREA-01', nome: 'Alice', perfil: 'Plantonista', cargo: 'Analista SR', username: 'alice', senhaHash: 'h' });

    const result = resolveAreaFallback('AREA-01', userRepo, areaRepo);

    expect(result.contacts).toHaveLength(1);
    const contact = result.contacts[0];
    expect(contact.id).toBeGreaterThan(0);
    expect(contact.nome).toBe('Alice');
    expect(contact.cargo).toBe('Analista SR');
    expect(contact.areaCodigo).toBe('AREA-01');
    expect(contact.areaNome).toBe('Infraestrutura');
  });

  it('torre fallback includes users from all areas in the torre, with correct area metadata', () => {
    areaRepo.create({ codigo: 'A1', nome: 'Area One', torre: 'Torre D' });
    areaRepo.create({ codigo: 'A2', nome: 'Area Two', torre: 'Torre D' });
    // A1 has no Command users
    userRepo.create({ codigo: 'U1', areaCodigo: 'A2', nome: 'UserFromA2', perfil: 'Plantonista', cargo: null, username: 'u1', senhaHash: 'h' });

    const result = resolveAreaFallback('A1', userRepo, areaRepo);

    expect(result.fallbackScope).toBe('torre');
    expect(result.contacts[0].areaCodigo).toBe('A2');
    expect(result.contacts[0].areaNome).toBe('Area Two');
  });
});
