import Database from 'better-sqlite3';
import { UserPermission } from '../../../shared/types';

export const AVAILABLE_MENUS = [
  'Mapa',
  'Importar',
  'Áreas',
  'Plantonistas',
  'Escalas',
  'Horários',
  'Problemas',
];

export class UserPermissionRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getByUser(userId: number): UserPermission[] {
    const stmt = this.db.prepare(`
      SELECT id, user_id, menu, can_read, can_edit, can_delete
      FROM user_permissions WHERE user_id = ?
      ORDER BY menu ASC
    `);
    const rows = stmt.all(userId) as any[];
    return rows.map(this.mapRow);
  }

  setPermission(userId: number, menu: string, canRead: boolean, canEdit: boolean, canDelete: boolean): void {
    const stmt = this.db.prepare(`
      INSERT INTO user_permissions (user_id, menu, can_read, can_edit, can_delete)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_id, menu) DO UPDATE SET
        can_read = excluded.can_read,
        can_edit = excluded.can_edit,
        can_delete = excluded.can_delete
    `);
    stmt.run(userId, menu, canRead ? 1 : 0, canEdit ? 1 : 0, canDelete ? 1 : 0);
  }

  replacePermissions(userId: number, permissions: Array<{ menu: string; canRead: boolean; canEdit: boolean; canDelete: boolean }>): void {
    const deleteStmt = this.db.prepare('DELETE FROM user_permissions WHERE user_id = ?');
    const insertStmt = this.db.prepare(`
      INSERT INTO user_permissions (user_id, menu, can_read, can_edit, can_delete)
      VALUES (?, ?, ?, ?, ?)
    `);

    const replaceAll = this.db.transaction((items: typeof permissions) => {
      deleteStmt.run(userId);
      for (const p of items) {
        insertStmt.run(userId, p.menu, p.canRead ? 1 : 0, p.canEdit ? 1 : 0, p.canDelete ? 1 : 0);
      }
    });

    replaceAll(permissions);
  }

  deleteByUser(userId: number): void {
    this.db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(userId);
  }

  private mapRow(row: any): UserPermission {
    return {
      id: row.id,
      userId: row.user_id,
      menu: row.menu,
      canRead: row.can_read === 1,
      canEdit: row.can_edit === 1,
      canDelete: row.can_delete === 1,
    };
  }
}
