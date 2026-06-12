import { describe, it, expect } from 'vitest';
import { mapRoleLabel, mapDisplayToInternal, formatUserDisplay } from './role-display';

describe('mapRoleLabel', () => {
  it('maps Plantonista to Command', () => {
    expect(mapRoleLabel('Plantonista')).toBe('Command');
  });

  it('maps Responsavel to Responsável', () => {
    expect(mapRoleLabel('Responsavel')).toBe('Responsável');
  });

  it('maps Adm to Admin', () => {
    expect(mapRoleLabel('Adm')).toBe('Admin');
  });

  it('returns the original value for unknown roles', () => {
    expect(mapRoleLabel('SomeOtherRole')).toBe('SomeOtherRole');
  });

  it('returns the original value for empty string', () => {
    expect(mapRoleLabel('')).toBe('');
  });
});

describe('mapDisplayToInternal', () => {
  it('maps Command back to Plantonista', () => {
    expect(mapDisplayToInternal('Command')).toBe('Plantonista');
  });

  it('maps Responsável back to Responsavel', () => {
    expect(mapDisplayToInternal('Responsável')).toBe('Responsavel');
  });

  it('maps Admin back to Adm', () => {
    expect(mapDisplayToInternal('Admin')).toBe('Adm');
  });

  it('returns the original value for unknown display labels', () => {
    expect(mapDisplayToInternal('UnknownLabel')).toBe('UnknownLabel');
  });

  it('returns the original value for empty string', () => {
    expect(mapDisplayToInternal('')).toBe('');
  });
});

describe('formatUserDisplay', () => {
  it('formats a Plantonista user correctly', () => {
    const user = { nome: 'João Silva', perfil: 'Plantonista' };
    expect(formatUserDisplay(user)).toBe('João Silva (Command)');
  });

  it('formats a Responsavel user correctly', () => {
    const user = { nome: 'Maria Santos', perfil: 'Responsavel' };
    expect(formatUserDisplay(user)).toBe('Maria Santos (Responsável)');
  });

  it('formats an Adm user correctly', () => {
    const user = { nome: 'Carlos Admin', perfil: 'Adm' };
    expect(formatUserDisplay(user)).toBe('Carlos Admin (Admin)');
  });

  it('formats a user with unknown perfil using original value', () => {
    const user = { nome: 'Ana Costa', perfil: 'Custom' };
    expect(formatUserDisplay(user)).toBe('Ana Costa (Custom)');
  });

  it('does not include codigo in output even if present on user object', () => {
    const user = { nome: 'Pedro Lima', perfil: 'Plantonista', codigo: 'USR001' };
    const result = formatUserDisplay(user);
    expect(result).toBe('Pedro Lima (Command)');
    expect(result).not.toContain('USR001');
  });
});
