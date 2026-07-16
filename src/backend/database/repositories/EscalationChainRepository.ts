import { Pool } from 'pg';
import { EscalationChainMember } from '../../../shared/types';

export class EscalationChainRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async getByTeam(teamId: string): Promise<EscalationChainMember[]> {
    const res = await this.db.query(`
      SELECT person_name, person_contact, position
      FROM escalation_chains
      WHERE team_id = $1
      ORDER BY position ASC
    `, [teamId]);
    return res.rows.map(this.mapRow);
  }

  async replaceChain(teamId: string, chain: EscalationChainMember[]): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM escalation_chains WHERE team_id = $1', [teamId]);
      for (const member of chain) {
        await client.query(`
          INSERT INTO escalation_chains (team_id, person_name, person_contact, position)
          VALUES ($1, $2, $3, $4)
        `, [
          teamId,
          member.personName,
          member.personContact || null,
          member.position
        ]);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async deleteByTeam(teamId: string): Promise<void> {
    await this.db.query('DELETE FROM escalation_chains WHERE team_id = $1', [teamId]);
  }

  private mapRow(row: any): EscalationChainMember {
    return {
      personName: row.person_name,
      personContact: row.person_contact || undefined,
      position: row.position,
    };
  }
}
