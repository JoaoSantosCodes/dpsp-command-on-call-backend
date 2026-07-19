import { Pool } from 'pg';
import dotenv from 'dotenv';
import { UserRepository } from './src/backend/database/repositories/UserRepository';

dotenv.config();

const db = new Pool({ connectionString: process.env.DATABASE_URL });
const repo = new UserRepository(db);

repo.getAll().then(users => {
  console.log('Total users from repo:', users.length);
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
