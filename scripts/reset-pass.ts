import { Pool } from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
dotenv.config();

async function run() {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const hash = await bcrypt.hash('admin123', 10);
  await db.query('UPDATE users SET senha_hash = $1 WHERE username = $2', [hash, 'admin']);
  console.log('Senha do usuario "admin" redefinida para "admin123"');
  
  // Create user "adm" just in case they meant exactly "adm"
  const hashAdm = await bcrypt.hash('adm123', 10);
  const res = await db.query('SELECT id FROM users WHERE username = $1', ['adm']);
  if (res.rows.length === 0) {
    await db.query(`
      INSERT INTO users (codigo, nome, perfil, username, senha_hash, ativo, aprovado)
      VALUES ($1, $2, $3, $4, $5, 1, 1)
    `, ['ADM-02', 'Admin Secundário', 'Adm', 'adm', hashAdm]);
    console.log('Usuario "adm" criado com senha "adm123"');
  } else {
    await db.query('UPDATE users SET senha_hash = $1 WHERE username = $2', [hashAdm, 'adm']);
    console.log('Senha do usuario "adm" redefinida para "adm123"');
  }

  process.exit(0);
}

run().catch(console.error);
