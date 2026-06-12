import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initializeDatabase } from '../init';
import { MonitorAreaMappingRepository } from './MonitorAreaMappingRepository';
import { AreaRepository } from './AreaRepository';

function createTestDb(): Database.Database {
  return initializeDatabase(':memory:');
}

describe('MonitorAreaMappingRepository', () => {
  let db: Database.Database;
  let repo: MonitorAreaMappingRepository;
  let areaRepo: AreaRepository;

  beforeEach(() => {
    db = createTestDb();
    repo = new MonitorAreaMappingRepository(db);
    areaRepo = new AreaRepository(db);
    areaRepo.create({ codigo: 'AREA-01', nome: 'Infraestrutura', torre: 'Torre A' });
    areaRepo.create({ codigo: 'AREA-02', nome: 'Aplicações', torre: 'Torre B' });
  });

  describe('getByMonitorId', () => {
    it('returns undefined when no mapping exists', () => {
      const result = repo.getByMonitorId(999);
      expect(result).toBeUndefined();
    });

    it('returns the mapping for a given monitor id', () => {
      repo.setMapping(100, 'AREA-01', 'Monitor Alpha');

      const result = repo.getByMonitorId(100);
      expect(result).toBeDefined();
      expect(result!.monitorId).toBe(100);
      expect(result!.areaCodigo).toBe('AREA-01');
      expect(result!.monitorName).toBe('Monitor Alpha');
      expect(result!.createdAt).toBeDefined();
      expect(result!.updatedAt).toBeDefined();
    });
  });

  describe('setMapping', () => {
    it('creates a new mapping', () => {
      repo.setMapping(100, 'AREA-01', 'Monitor Alpha');

      const result = repo.getByMonitorId(100);
      expect(result).toBeDefined();
      expect(result!.areaCodigo).toBe('AREA-01');
      expect(result!.monitorName).toBe('Monitor Alpha');
    });

    it('updates an existing mapping (upsert)', () => {
      repo.setMapping(100, 'AREA-01', 'Monitor Alpha');
      repo.setMapping(100, 'AREA-02', 'Monitor Alpha Updated');

      const result = repo.getByMonitorId(100);
      expect(result).toBeDefined();
      expect(result!.areaCodigo).toBe('AREA-02');
      expect(result!.monitorName).toBe('Monitor Alpha Updated');
    });

    it('allows multiple monitors mapped to the same area', () => {
      repo.setMapping(100, 'AREA-01', 'Monitor Alpha');
      repo.setMapping(200, 'AREA-01', 'Monitor Beta');

      const results = repo.getByArea('AREA-01');
      expect(results).toHaveLength(2);
    });
  });

  describe('getByArea', () => {
    it('returns empty array when no monitors mapped to area', () => {
      const result = repo.getByArea('AREA-01');
      expect(result).toEqual([]);
    });

    it('returns all monitors mapped to the specified area', () => {
      repo.setMapping(100, 'AREA-01', 'Monitor Alpha');
      repo.setMapping(200, 'AREA-01', 'Monitor Beta');
      repo.setMapping(300, 'AREA-02', 'Monitor Gamma');

      const result = repo.getByArea('AREA-01');
      expect(result).toHaveLength(2);
      expect(result.map(m => m.monitorId).sort()).toEqual([100, 200]);
    });

    it('does not return monitors from other areas', () => {
      repo.setMapping(100, 'AREA-01', 'Monitor Alpha');
      repo.setMapping(200, 'AREA-02', 'Monitor Beta');

      const result = repo.getByArea('AREA-02');
      expect(result).toHaveLength(1);
      expect(result[0].monitorId).toBe(200);
    });
  });

  describe('getAllMapped', () => {
    it('returns empty array when no mappings exist', () => {
      const result = repo.getAllMapped();
      expect(result).toEqual([]);
    });

    it('returns all mappings across all areas', () => {
      repo.setMapping(100, 'AREA-01', 'Monitor Alpha');
      repo.setMapping(200, 'AREA-02', 'Monitor Beta');
      repo.setMapping(300, 'AREA-01', 'Monitor Gamma');

      const result = repo.getAllMapped();
      expect(result).toHaveLength(3);
    });
  });

  describe('deleteMapping', () => {
    it('removes the mapping for a monitor', () => {
      repo.setMapping(100, 'AREA-01', 'Monitor Alpha');
      repo.deleteMapping(100);

      const result = repo.getByMonitorId(100);
      expect(result).toBeUndefined();
    });

    it('does not affect other mappings', () => {
      repo.setMapping(100, 'AREA-01', 'Monitor Alpha');
      repo.setMapping(200, 'AREA-01', 'Monitor Beta');

      repo.deleteMapping(100);

      const remaining = repo.getAllMapped();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].monitorId).toBe(200);
    });

    it('does nothing when monitor has no mapping', () => {
      // Should not throw
      repo.deleteMapping(999);
      expect(repo.getAllMapped()).toEqual([]);
    });
  });
});
