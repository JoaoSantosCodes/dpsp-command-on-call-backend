// Cadastrar escala PDV - 09/07, 11/07, 12/07
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'command-center.db'));
const senhaHash = bcrypt.hashSync('plantonista123', 10);

// Plantonistas PDV
const plantonistas = [
  { nome: 'Felipe Guilherme Pereira Mendes', contato: '(81) 99975-8995', cargo: 'Analista de Sistemas III' },
  { nome: 'Paulo Rogerio de Araujo', contato: '(11) 98539-6996', cargo: 'Analista de Projetos de TI II' },
  { nome: 'Diego Barboza dos Santos', contato: null, cargo: 'Analista de Projetos de TI III' },
];

console.log('=== Cadastrando plantonistas PDV ===');
for (const p of plantonistas) {
  const username = p.nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '')
    .substring(0, 30);
  
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!existing) {
    const codigo = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    db.prepare(`INSERT INTO users (codigo, area_codigo, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))`).run(
      codigo, 'PDV', p.nome, 'Plantonista', '1º Escalão', p.cargo, p.contato, username, senhaHash
    );
    console.log(`  ✓ Criado: ${p.nome}`);
  } else {
    console.log(`  → Já existe: ${p.nome}`);
  }
}

// Escalas
const escalas = [
  { dia: '2026-07-09', nome: 'Felipe Guilherme Pereira Mendes', horario: '07:00 às 17:00' },
  { dia: '2026-07-11', nome: 'Paulo Rogerio de Araujo', horario: '07:00 às 17:00' },
  { dia: '2026-07-12', nome: 'Diego Barboza dos Santos', horario: '07:00 às 17:00' },
];

console.log('\n=== Cadastrando períodos e escalas ===');
for (const e of escalas) {
  const periodoCodigo = `PER-PDV-${e.dia}`;
  
  // Criar período
  const existingPer = db.prepare('SELECT id FROM periodos WHERE codigo = ?').get(periodoCodigo);
  if (!existingPer) {
    db.prepare(`INSERT INTO periodos (codigo, data, horarios, area_codigo, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`).run(
      periodoCodigo, e.dia, e.horario, 'PDV'
    );
  }

  // Vincular escala
  const user = db.prepare('SELECT codigo FROM users WHERE nome = ? AND area_codigo = ?').get(e.nome, 'PDV');
  if (user) {
    const existingEsc = db.prepare('SELECT id FROM escalas WHERE periodo_codigo = ? AND usuario_codigo = ?').get(periodoCodigo, user.codigo);
    if (!existingEsc) {
      const escalaCodigo = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
      db.prepare(`INSERT INTO escalas (codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`).run(
        escalaCodigo, 'PDV', periodoCodigo, user.codigo
      );
    }
  }

  // Escalation schedules (para o mapa)
  const diaNum = parseInt(e.dia.split('-')[2]);
  db.prepare('INSERT OR IGNORE INTO escalation_schedules (area, colaborador, cargo, nivel, contato, dia, mes, ano, horario_inicio, horario_fim, is_24h) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
    'PDV', e.nome, 'Analista', '1º Escalão', '', diaNum, 7, 2026, '07:00', '17:00', 0
  );

  console.log(`  ✓ ${e.dia} → ${e.nome} (${e.horario})`);
}

console.log('\n✓ Escala PDV cadastrada!');
db.close();
