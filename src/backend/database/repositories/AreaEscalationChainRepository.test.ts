import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../init';
import { AreaEscalationChainRepository } from './AreaEscalationChainRepository';
import { AreaRepository } from './AreaRepository';

function createTestDb(): Database.Database {
  return initializeDatabase(':memory:');
}

describe('AreaEscalationChainRepository', () => {
  let db: Database.Database;
  let repo: AreaEscalationChainRepository;
  let areaRepo: AreaRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new AreaEscalationChainRepository(db);
    areaRepo = new AreaRepository(db);
    areaRepo.create({ codigo: 'AREA-01', nome: 'Infraestrutura', torre: 'Torre A' });
    areaRepo.create({ codigo: 'AREA-02', nome: 'Aplicações', torre: 'Torre B' });
  });

  describe('getByArea', () => {
    it('returns empty array when no chain exists for area', () => {
      const result = repo.getByArea('AREA-01');
      expect(result).toEqual([]);
    });

    it('returns chain members ordered by position', () => {
      repo.replaceChain('AREA-01', [
        { personName: 'Charlie', personContact: '333', position: 3 },
        { personName: 'Alice', personContact: '111', position: 1 },
        { personName: 'Bob', personContact: '222', position: 2 },
      ]);

      const result = repo.getByArea('AREA-01');
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ personName: 'Alice', personContact: '111', position: 1 });
      expect(result[1]).toEqual({ personName: 'Bob', personContact: '222', position: 2 });
      expect(result[2]).toEqual({ personName: 'Charlie', personContact: '333', position: 3 });
    });

    it('returns only members for the specified area', () => {
      repo.replaceChain('AREA-01', [
        { personName: 'Alice', personContact: '111', position: 1 },
      ]);
      repo.replaceChain('AREA-02', [
        { personName: 'Bob', personContact: '222', position: 1 },
      ]);

      const result = repo.getByArea('AREA-01');
      expect(result).toHaveLength(1);
      expect(result[0].personName).toBe('Alice');
    });
  });

  describe('replaceChain', () => {
    it('inserts a new chain for an area', () => {
      repo.replaceChain('AREA-01', [
        { personName: 'Alice', personContact: '111', position: 1 },
        { personName: 'Bob', position: 2 },
      ]);

      const result = repo.getByArea('AREA-01');
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ personName: 'Alice', personContact: '111', position: 1 });
      expect(result[1]).toEqual({ personName: 'Bob', personContact: undefined, position: 2 });
    });

    it('replaces an existing chain entirely', () => {
      repo.replaceChain('AREA-01', [
        { personName: 'Alice', personContact: '111', position: 1 },
        { personName: 'Bob', personContact: '222', position: 2 },
      ]);

      repo.replaceChain('AREA-01', [
        { personName: 'Charlie', personContact: '333', position: 1 },
      ]);

      const result = repo.getByArea('AREA-01');
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual({ personName: 'Charlie', personContact: '333', position: 1 });
    });

    it('handles empty chain (clears all members)', () => {
      repo.replaceChain('AREA-01', [
        { personName: 'Alice', personContact: '111', position: 1 },
      ]);

      repo.replaceChain('AREA-01', []);

      const result = repo.getByArea('AREA-01');
      expect(result).toEqual([]);
    });

    it('handles member without personContact', () => {
      repo.replaceChain('AREA-01', [
        { personName: 'Alice', position: 1 },
      ]);

      const result = repo.getByArea('AREA-01');
      expect(result[0].personContact).toBeUndefined();
    });

    it('does not affect other areas when replacing', () => {
      repo.replaceChain('AREA-01', [
        { personName: 'Alice', personContact: '111', position: 1 },
      ]);
      repo.replaceChain('AREA-02', [
        { personName: 'Bob', personContact: '222', position: 1 },
      ]);

      repo.replaceChain('AREA-01', [
        { personName: 'Charlie', personContact: '333', position: 1 },
      ]);

      const area02 = repo.getByArea('AREA-02');
      expect(area02).toHaveLength(1);
      expect(area02[0].personName).toBe('Bob');
    });
  });

  describe('deleteByArea', () => {
    it('deletes all chain members for an area', () => {
      repo.replaceChain('AREA-01', [
        { personName: 'Alice', personContact: '111', position: 1 },
        { personName: 'Bob', personContact: '222', position: 2 },
      ]);

      repo.deleteByArea('AREA-01');

      const result = repo.getByArea('AREA-01');
      expect(result).toEqual([]);
    });

    it('does not affect other areas', () => {
      repo.replaceChain('AREA-01', [
        { personName: 'Alice', personContact: '111', position: 1 },
      ]);
      repo.replaceChain('AREA-02', [
        { personName: 'Bob', personContact: '222', position: 1 },
      ]);

      repo.deleteByArea('AREA-01');

      const area02 = repo.getByArea('AREA-02');
      expect(area02).toHaveLength(1);
      expect(area02[0].personName).toBe('Bob');
    });

    it('does nothing when area has no chain', () => {
      // Should not throw
      repo.deleteByArea('AREA-01');
      expect(repo.getByArea('AREA-01')).toEqual([]);
    });
  });
});
