import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const db = new Pool({ connectionString: process.env.DATABASE_URL });
db.query('SELECT id, username, perfil, ativo, aprovado FROM users').then(res => {
  console.table(res.rows);
  process.exit(0);
}).catch(console.error);
