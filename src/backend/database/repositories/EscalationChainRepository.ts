import Database from 'better-sqlite3';
import { EscalationChainMember } from '../../shared/types';

export class EscalationChainRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  getByTeam(teamId: string): EscalationChainMember[] {
    const stmt = this.db.prepare(`
      SELECT person_name, person_contact, position
      FROM escalation_chains
      WHERE team_id = ?
      ORDER BY position ASC
    `);
    const rows = stmt.all(teamId) as any[];
    return rows.map(this.mapRow);
  }

  replaceChain(teamId: string, chain: EscalationChainMember[]): void {
    const deleteStmt = this.db.prepare('DELETE FROM escalation_chains WHERE team_id = ?');
    const insertStmt = this.db.prepare(`
      INSERT INTO escalation_chains (team_id, person_name, person_contact, position)
      VALUES (?, ?, ?, ?)
    `);

    const replaceAll = this.db.transaction((members: EscalationChainMember[]) => {
      deleteStmt.run(teamId);
      for (const member of members) {
        insertStmt.run(
          teamId,
          member.personName,
          member.personContact || null,
          member.position
        );
      }
    });

    replaceAll(chain);
  }

  deleteByTeam(teamId: string): void {
    const stmt = this.db.prepare('DELETE FROM escalation_chains WHERE team_id = ?');
    stmt.run(teamId);
  }

  private mapRow(row: any): EscalationChainMember {
    return {
      personName: row.person_name,
      personContact: row.person_contact || undefined,
      position: row.position,
    };
  }
}
