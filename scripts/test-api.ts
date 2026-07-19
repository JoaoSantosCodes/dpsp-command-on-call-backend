import { Pool } from 'pg';
import dotenv from 'dotenv';
import jwt from 'jsonwebtoken';

dotenv.config();

async function run() {
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  const res = await db.query('SELECT id, perfil FROM users WHERE username = $1', ['admin']);
  const admin = res.rows[0];
  
  if (!admin) {
    console.error('Admin not found');
    process.exit(1);
  }

  const token = jwt.sign(
    { userId: admin.id, perfil: admin.perfil, areaCodigo: null },
    process.env.JWT_SECRET || 'fallback-secret',
    { expiresIn: '1d' }
  );

  const response = await fetch('https://dpsp-command-on-call-backend.onrender.com/api/users', {
    headers: { Authorization: `Bearer ${token}` }
  });

  const data = await response.json();
  console.log('API returned users count:', data.users ? data.users.length : 0);
  console.log('First 2 users:', data.users?.slice(0, 2));
  process.exit(0);
}

run().catch(console.error);
