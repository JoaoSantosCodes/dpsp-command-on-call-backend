import { Pool } from 'pg';
import dotenv from 'dotenv';
dotenv.config();
const db = new Pool({ connectionString: process.env.DATABASE_URL });
db.query('SELECT count(*) FROM users').then(r => console.log('Users count:', r.rows[0].count)).catch(console.error).finally(()=>process.exit(0));
