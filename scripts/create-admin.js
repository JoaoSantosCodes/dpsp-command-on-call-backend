// Create default admin user
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'command-center.db');
const db = new Database(DB_PATH);

const senhaHash = bcrypt.hashSync('admin123', 10);
const codigo = 'ADM-001';
const username = 'admin';

// Check if admin exists
const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
if (existing) {
  console.log('Admin user already exists (id:', existing.id, ')');
} else {
  db.prepare(`
    INSERT INTO users (codigo, area_codigo, nome, perfil, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
  `).run(codigo, 'COMMAND_CENTER', 'Administrador', 'Adm', 'Administrador', null, username, senhaHash);
  console.log('✓ Admin user created!');
  console.log('  Username: admin');
  console.log('  Senha: admin123');
}

db.close();
