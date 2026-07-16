const fs = require('fs');
const path = require('path');

const repoDir = path.join(__dirname, '../src/backend/database/repositories');
const files = fs.readdirSync(repoDir).filter(f => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts');

for (const file of files) {
  const filePath = path.join(repoDir, file);
  let content = fs.readFileSync(filePath, 'utf8');

  // Replace imports
  content = content.replace(/import Database from 'better-sqlite3';/, "import { Pool } from 'pg';");
  content = content.replace(/import type { Database } from 'better-sqlite3';/, "import { Pool } from 'pg';");
  
  // Replace class property
  content = content.replace(/private db: Database\.Database;/g, "private db: Pool;");
  content = content.replace(/constructor\(db: Database\.Database\)/g, "constructor(db: Pool)");

  // Replace functions to be async
  content = content.replace(/public ([\w]+)\((.*?)\): ([\w<>[\]]+) {/g, (match, name, args, ret) => {
    return `public async ${name}(${args}): Promise<${ret}> {`;
  });

  // Replace stmt.all()
  // const stmt = this.db.prepare('SELECT * FROM areas');
  // return stmt.all() as Area[];
  
  content = content.replace(/const stmt = this\.db\.prepare\(([\s\S]*?)\);\s*return stmt\.all\(\) as (.*?);/g, 
    "const res = await this.db.query($1);\n    return res.rows as $2;");

  // Replace stmt.get()
  // const stmt = this.db.prepare('SELECT * FROM areas WHERE id = ?');
  // return stmt.get(id) as Area;
  content = content.replace(/const stmt = this\.db\.prepare\(([\s\S]*?)\);\s*const row = stmt\.get\((.*?)\) as (.*?);\s*if \(!row\) return undefined;\s*return (.*?);/g, 
    "const res = await this.db.query($1, [$2]);\n    const row = res.rows[0];\n    if (!row) return undefined;\n    return row as $3;");
  
  content = content.replace(/const stmt = this\.db\.prepare\(([\s\S]*?)\);\s*return stmt\.get\((.*?)\) as (.*?);/g, 
    "const res = await this.db.query($1, [$2]);\n    return res.rows[0] as $3;");

  content = content.replace(/const stmt = this\.db\.prepare\(([\s\S]*?)\);\s*return stmt\.get\((.*?)\) !== undefined;/g, 
    "const res = await this.db.query($1, [$2]);\n    return res.rows.length > 0;");

  // Replace stmt.run()
  content = content.replace(/const stmt = this\.db\.prepare\(([\s\S]*?)\);\s*const result = stmt\.run\((.*?)\);\s*return result\.lastInsertRowid as number;/g, 
    "const res = await this.db.query($1 + ' RETURNING id', [$2]);\n    return res.rows[0].id as number;");

  content = content.replace(/const stmt = this\.db\.prepare\(([\s\S]*?)\);\s*stmt\.run\((.*?)\);/g, 
    "await this.db.query($1, [$2]);");
    
  content = content.replace(/const stmt = this\.db\.prepare\(([\s\S]*?)\);\s*const result = stmt\.run\((.*?)\);\s*return result\.changes > 0;/g, 
    "const res = await this.db.query($1, [$2]);\n    return (res.rowCount || 0) > 0;");

  fs.writeFileSync(filePath, content);
}
console.log('Done refactoring repositories!');
