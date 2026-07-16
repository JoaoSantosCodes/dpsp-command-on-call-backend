import { Pool } from 'pg';
import { EscalationChainMember } from '../../../shared/types';

export class AreaEscalationChainRepository {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  async getByArea(areaCodigo: string): Promise<EscalationChainMember[]> {
    const res = await this.db.query(`
      SELECT person_name, person_contact, position
      FROM area_escalation_chains
      WHERE area_codigo = $1
      ORDER BY position ASC
    `, [areaCodigo]);
    return res.rows.map(this.mapRow);
  }

  async replaceChain(areaCodigo: string, chain: EscalationChainMember[]): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM area_escalation_chains WHERE area_codigo = $1', [areaCodigo]);
      for (const member of chain) {
        await client.query(`
          INSERT INTO area_escalation_chains (area_codigo, person_name, person_contact, position)
          VALUES ($1, $2, $3, $4)
        `, [
          areaCodigo,
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

  async deleteByArea(areaCodigo: string): Promise<void> {
    await this.db.query('DELETE FROM area_escalation_chains WHERE area_codigo = $1', [areaCodigo]);
  }

  private mapRow(row: any): EscalationChainMember {
    return {
      personName: row.person_name,
      personContact: row.person_contact || undefined,
      position: row.position,
    };
  }
}
