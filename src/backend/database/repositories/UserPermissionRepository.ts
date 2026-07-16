import { Pool } from 'pg';
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
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async getByUser(userId: number): Promise<UserPermission[]> {
    const res = await this.db.query(`
      SELECT id, user_id, menu, can_read, can_edit, can_delete
      FROM user_permissions WHERE user_id = $1
      ORDER BY menu ASC
    `, [userId]);
    return res.rows.map(this.mapRow);
  }

  async setPermission(userId: number, menu: string, canRead: boolean, canEdit: boolean, canDelete: boolean): Promise<void> {
    await this.db.query(`
      INSERT INTO user_permissions (user_id, menu, can_read, can_edit, can_delete)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT(user_id, menu) DO UPDATE SET
        can_read = excluded.can_read,
        can_edit = excluded.can_edit,
        can_delete = excluded.can_delete
    `, [userId, menu, canRead, canEdit, canDelete]);
  }

  async replacePermissions(userId: number, permissions: Array<{ menu: string; canRead: boolean; canEdit: boolean; canDelete: boolean }>): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);
      for (const p of permissions) {
        await client.query(`
          INSERT INTO user_permissions (user_id, menu, can_read, can_edit, can_delete)
          VALUES ($1, $2, $3, $4, $5)
        `, [userId, p.menu, p.canRead, p.canEdit, p.canDelete]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteByUser(userId: number): Promise<void> {
    await this.db.query('DELETE FROM user_permissions WHERE user_id = $1', [userId]);
  }

  private mapRow(row: any): UserPermission {
    return {
      id: row.id,
      userId: row.user_id,
      menu: row.menu,
      canRead: row.can_read === 1 || row.can_read === true,
      canEdit: row.can_edit === 1 || row.can_edit === true,
      canDelete: row.can_delete === 1 || row.can_delete === true,
    };
  }
}
