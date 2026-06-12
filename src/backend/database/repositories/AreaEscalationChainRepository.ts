import Database from 'better-sqlite3';
import { EscalationChainMember } from '../../shared/types';

export class AreaEscalationChainRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getByArea(areaCodigo: string): EscalationChainMember[] {
    const stmt = this.db.prepare(`
      SELECT person_name, person_contact, position
      FROM area_escalation_chains
      WHERE area_codigo = ?
      ORDER BY position ASC
    `);
    const rows = stmt.all(areaCodigo) as any[];
    return rows.map(this.mapRow);
  }

  replaceChain(areaCodigo: string, chain: EscalationChainMember[]): void {
    const deleteStmt = this.db.prepare('DELETE FROM area_escalation_chains WHERE area_codigo = ?');
    const insertStmt = this.db.prepare(`
      INSERT INTO area_escalation_chains (area_codigo, person_name, person_contact, position)
      VALUES (?, ?, ?, ?)
    `);

    const replaceAll = this.db.transaction((members: EscalationChainMember[]) => {
      deleteStmt.run(areaCodigo);
      for (const member of members) {
        insertStmt.run(
          areaCodigo,
          member.personName,
          member.personContact || null,
          member.position
        );
      }
    });

    replaceAll(chain);
  }

  deleteByArea(areaCodigo: string): void {
    const stmt = this.db.prepare('DELETE FROM area_escalation_chains WHERE area_codigo = ?');
    stmt.run(areaCodigo);
  }

  private mapRow(row: any): EscalationChainMember {
    return {
      personName: row.person_name,
      personContact: row.person_contact || undefined,
      position: row.position,
    };
  }
}
