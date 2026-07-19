import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const res = await db.query(`
    SELECT id, codigo, area_codigo, area_solicitada, nome, perfil, nivel_escalonamento, cargo, contato, username, ativo, aprovado
    FROM users ORDER BY nome ASC
  `);
  console.log(`Total users in DB: ${res.rows.length}`);
  console.log(`Users preview:`, res.rows.slice(0, 5));
  process.exit(0);
}

run().catch(console.error);
