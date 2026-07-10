// Test PostgreSQL connection to Supabase
const { Pool } = require('pg');

const connectionString = 'postgresql://postgres.qghlfnkwwefilehthudw:OOlocaoOO%402026@aws-1-us-west-2.pooler.supabase.com:5432/postgres';

async function test() {
  console.log('Connecting to Supabase PostgreSQL...');
  
  const pool = new Pool({
    host: 'aws-1-us-west-2.pooler.supabase.com',
    port: 5432,
    database: 'postgres',
    user: 'postgres.qghlfnkwwefilehthudw',
    password: 'OOlocaoOO@2026',
    ssl: { rejectUnauthorized: false },
  });

  try {
    const res = await pool.query('SELECT NOW() as time, version()');
    console.log('✓ Connected!');
    console.log('  Time:', res.rows[0].time);
    console.log('  Version:', res.rows[0].version.substring(0, 50));
    
    // Test creating a simple table
    await pool.query('CREATE TABLE IF NOT EXISTS _test_connection (id SERIAL PRIMARY KEY, msg TEXT)');
    await pool.query("INSERT INTO _test_connection (msg) VALUES ('hello from command center')");
    const check = await pool.query('SELECT * FROM _test_connection');
    console.log('  Test table:', check.rows);
    await pool.query('DROP TABLE _test_connection');
    console.log('  Test table cleaned up');
    
    console.log('\n✓ PostgreSQL connection working!');
  } catch (e) {
    console.error('✗ Error:', e.message);
  } finally {
    await pool.end();
  }
}

test();
