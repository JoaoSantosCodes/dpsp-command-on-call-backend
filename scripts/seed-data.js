// Seed database with sample data based on the Time Cloud spreadsheet
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'command-center.db');
const db = new Database(DB_PATH);

const senhaHash = bcrypt.hashSync('plantonista123', 10);

// === Plantonistas from Time Cloud ===
const plantonistas = [
  { nome: 'Vitor Morais Clauz', contato: '11 98312-4847', area: 'DEVOPS_CLOUD' },
  { nome: 'Claudio Rogerio Ribeiro Lopes', contato: '14 99137-1213', area: 'DEVOPS_CLOUD' },
  { nome: 'David Alves de Araujo', contato: '21 99834-0406', area: 'DEVOPS_CLOUD' },
  { nome: 'Ricardo Fracini', contato: '11 96911-6690', area: 'DEVOPS_CLOUD' },
  { nome: 'Vitor Fratucci Francisco', contato: '11 99759-6678', area: 'DEVOPS_CLOUD' },
  { nome: 'Marcelo Vilela de Morais', contato: '11 98273-9488', area: 'DEVOPS_CLOUD' },
  { nome: 'Yago Castilho', contato: '11 93444-1518', area: 'DEVOPS_CLOUD' },
  // Escalation
  { nome: 'Leandro Silva', contato: '24 99266-6604', area: 'DEVOPS_CLOUD', nivel: '2º Escalão' },
  { nome: 'Jair Nascimento', contato: '11 99741-1892', area: 'DEVOPS_CLOUD', nivel: '3º Escalão' },
  { nome: 'Alex Almeida', contato: '11 99693-6308', area: 'DEVOPS_CLOUD', nivel: '4º Escalão' },
  // Infra Data Center
  { nome: 'Andrie Ferreira Bittencourt', contato: '11 96392-0260', area: 'INFRAESTRUTURA_DATA_CENTER' },
  { nome: 'Carlos Eduardo Silva', contato: '11 98765-4321', area: 'INFRAESTRUTURA_DATA_CENTER' },
  { nome: 'Fernando Oliveira', contato: '11 91234-5678', area: 'INFRAESTRUTURA_DATA_CENTER' },
  // Redes
  { nome: 'Mauricio Santos Pomponet', contato: '11 94195-7625', area: 'REDES' },
  { nome: 'Roberto Mendes', contato: '11 95555-1234', area: 'REDES' },
  { nome: 'Patricia Lima', contato: '11 96666-4321', area: 'REDES' },
  // Soluções Corporativas
  { nome: 'Marcelo Almeida', contato: '11 94546-0472', area: 'SOLUCOES_CORPORATIVAS' },
  { nome: 'Ana Paula Rodrigues', contato: '11 97777-8888', area: 'SOLUCOES_CORPORATIVAS' },
  // Torre Soluções Logísticas
  { nome: 'Robson Rogerio dos Santos', contato: '11 98177-7837', area: 'TORRE_SOLUCOES_LOGISTICAS' },
  { nome: 'Fabricio Spano', contato: '11 97208-7822', area: 'TORRE_SOLUCOES_LOGISTICAS' },
  // Torre Soluções Com e Marketing
  { nome: 'Priscila Lira Alves', contato: '11 97355-7180', area: 'TORRE_SOLUCOES_COM_E_MARKETING' },
  // Segurança da Informação
  { nome: 'Sergio Castanho', contato: '11 96413-1405', area: 'SEGURANCA_DA_INFORMACAO' },
  // Integrações
  { nome: 'Tarciso Franzote Perozini', contato: '11 99888-7766', area: 'INTEGRACOES__CPI_ODI_OGG_' },
  // Command Center
  { nome: 'Diego Carmo', contato: '11 94333-4500', area: 'COMMAND_CENTER' },
];

// === Create Users ===
console.log('=== Criando plantonistas ===');
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (codigo, area_codigo, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
`);

let created = 0;
for (const p of plantonistas) {
  const username = p.nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '')
    .substring(0, 30);
  
  const codigo = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  const nivel = p.nivel || '1º Escalão';
  
  try {
    insertUser.run(codigo, p.area, p.nome, 'Plantonista', nivel, 'Analista', p.contato, username, senhaHash);
    created++;
  } catch (e) {
    // Skip duplicates
  }
}
console.log(`  ${created} plantonistas criados`);

// === Update Area coordinators/managers ===
console.log('\n=== Atualizando coordenadores/gerentes das áreas ===');
const updateArea = db.prepare(`
  UPDATE areas SET coordenador_nome = ?, coordenador_contato = ?, gerente_nome = ?, gerente_contato = ?, torre = ?
  WHERE codigo = ?
`);

const areaUpdates = [
  { codigo: 'COMMAND_CENTER', coord: 'Diego Carmo', coordContato: '(11) 94333-4500', gerente: 'Alexandre Carvalho de Lima', gerenteContato: '(11) 98965-2816', torre: 'Command Center' },
  { codigo: 'DEVOPS_CLOUD', coord: 'Jair Meira Nascimento', coordContato: '(11) 99741-1892', gerente: 'Alex Almeida', gerenteContato: '(11) 99693-6308', torre: 'DevOps/Cloud' },
  { codigo: 'INFRAESTRUTURA_DATA_CENTER', coord: 'Andrie Ferreira Bittencourt', coordContato: '(11) 96392-0260', gerente: 'Alex Almeida', gerenteContato: '(11) 99693-6308', torre: 'Infraestrutura' },
  { codigo: 'REDES', coord: 'Mauricio Santos Pomponet', coordContato: '(11) 94195-7625', gerente: 'Marcos Marra Boldori', gerenteContato: '(11) 93259-6134', torre: 'Redes' },
  { codigo: 'SOLUCOES_CORPORATIVAS', coord: 'Marcelo Almeida', coordContato: '(11) 94546-0472', gerente: 'William Mendonça', gerenteContato: '(11) 94554-4585', torre: 'Soluções Corporativas' },
  { codigo: 'TORRE_SOLUCOES_LOGISTICAS', coord: 'Robson Rogerio dos Santos', coordContato: '(11) 98177-7837', gerente: 'Fabricio Spano', gerenteContato: '(11) 97208-7822', torre: 'Soluções Logísticas' },
  { codigo: 'TORRE_SOLUCOES_COM_E_MARKETING', coord: 'Priscila Lira Alves', coordContato: '(11) 97355-7180', gerente: null, gerenteContato: null, torre: 'Soluções Comerciais e MKT' },
  { codigo: 'SEGURANCA_DA_INFORMACAO', coord: null, coordContato: null, gerente: 'Sergio Castanho', gerenteContato: '(11) 96413-1405', torre: 'Segurança da Informação' },
  { codigo: 'INTEGRACOES__CPI_ODI_OGG_', coord: 'Tarciso Franzote Perozini', coordContato: null, gerente: 'Alex Almeida', gerenteContato: '(11) 99693-6308', torre: 'Integrações' },
  { codigo: 'PDV', coord: null, coordContato: null, gerente: null, gerenteContato: null, torre: 'PDV' },
  { codigo: 'BALCAO', coord: null, coordContato: null, gerente: null, gerenteContato: null, torre: 'Balcão' },
  { codigo: 'BDE_ODI___MALHA_DE_PRECOS', coord: null, coordContato: null, gerente: null, gerenteContato: null, torre: 'BDE/ODI' },
  { codigo: 'TORRE_SOLUCOES_DIGITAIS', coord: null, coordContato: null, gerente: null, gerenteContato: null, torre: 'Soluções Digitais' },
];

for (const a of areaUpdates) {
  updateArea.run(a.coord, a.coordContato, a.gerente, a.gerenteContato, a.torre, a.codigo);
}
console.log(`  ${areaUpdates.length} áreas atualizadas`);

// === Create Escalation Schedules (July 2026) ===
console.log('\n=== Criando escalas de sobreaviso (Julho 2026) ===');
const insertSchedule = db.prepare(`
  INSERT INTO escalation_schedules (area, colaborador, cargo, nivel, contato, dia, mes, ano, horario_inicio, horario_fim, is_24h)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const escalas = [
  { nome: 'Claudio Rogerio Ribeiro Lopes', contato: '14 99137-1213', dia: 1, inicio: '18:00', fim: '06:00' },
  { nome: 'Vitor Morais Clauz', contato: '11 98312-4847', dia: 2, inicio: '18:00', fim: '06:00' },
  { nome: 'Vitor Fratucci Francisco', contato: '11 99759-6678', dia: 3, inicio: '18:00', fim: '08:00' },
  { nome: 'David Alves de Araujo', contato: '21 99834-0406', dia: 4, inicio: '08:00', fim: '08:00' },
  { nome: 'Ricardo Fracini', contato: '11 96911-6690', dia: 5, inicio: '08:00', fim: '06:00' },
  { nome: 'Yago Castilho', contato: '11 93444-1518', dia: 6, inicio: '18:00', fim: '06:00' },
  { nome: 'Vitor Morais Clauz', contato: '11 98312-4847', dia: 7, inicio: '18:00', fim: '06:00' },
  { nome: 'Claudio Rogerio Ribeiro Lopes', contato: '14 99137-1213', dia: 8, inicio: '18:00', fim: '06:00' },
  { nome: 'Marcelo Vilela de Morais', contato: '11 98273-9488', dia: 9, inicio: '08:00', fim: '06:00' },
  { nome: 'Ricardo Fracini', contato: '11 96911-6690', dia: 10, inicio: '18:00', fim: '08:00' },
  { nome: 'Vitor Fratucci Francisco', contato: '11 99759-6678', dia: 11, inicio: '08:00', fim: '08:00' },
  { nome: 'Marcelo Vilela de Morais', contato: '11 98273-9488', dia: 12, inicio: '08:00', fim: '06:00' },
  { nome: 'David Alves de Araujo', contato: '21 99834-0406', dia: 13, inicio: '18:00', fim: '06:00' },
  { nome: 'Yago Castilho', contato: '11 93444-1518', dia: 14, inicio: '18:00', fim: '06:00' },
  { nome: 'Vitor Morais Clauz', contato: '11 98312-4847', dia: 15, inicio: '18:00', fim: '06:00' },
  { nome: 'Ricardo Fracini', contato: '11 96911-6690', dia: 16, inicio: '18:00', fim: '06:00' },
  { nome: 'David Alves de Araujo', contato: '21 99834-0406', dia: 17, inicio: '18:00', fim: '08:00' },
  { nome: 'Yago Castilho', contato: '11 93444-1518', dia: 18, inicio: '08:00', fim: '08:00' },
  { nome: 'Vitor Morais Clauz', contato: '11 98312-4847', dia: 19, inicio: '08:00', fim: '06:00' },
  { nome: 'Marcelo Vilela de Morais', contato: '11 98273-9488', dia: 20, inicio: '18:00', fim: '06:00' },
  { nome: 'Vitor Morais Clauz', contato: '11 98312-4847', dia: 21, inicio: '18:00', fim: '06:00' },
  { nome: 'David Alves de Araujo', contato: '21 99834-0406', dia: 22, inicio: '18:00', fim: '06:00' },
  { nome: 'Yago Castilho', contato: '11 93444-1518', dia: 23, inicio: '18:00', fim: '06:00' },
  { nome: 'Vitor Fratucci Francisco', contato: '11 99759-6678', dia: 24, inicio: '18:00', fim: '08:00' },
  { nome: 'Ricardo Fracini', contato: '11 96911-6690', dia: 25, inicio: '08:00', fim: '08:00' },
  { nome: 'David Alves de Araujo', contato: '21 99834-0406', dia: 26, inicio: '08:00', fim: '06:00' },
  { nome: 'Marcelo Vilela de Morais', contato: '11 98273-9488', dia: 27, inicio: '18:00', fim: '06:00' },
  { nome: 'Claudio Rogerio Ribeiro Lopes', contato: '14 99137-1213', dia: 28, inicio: '18:00', fim: '06:00' },
  { nome: 'Vitor Morais Clauz', contato: '11 98312-4847', dia: 29, inicio: '18:00', fim: '06:00' },
  { nome: 'Yago Castilho', contato: '11 93444-1518', dia: 30, inicio: '18:00', fim: '06:00' },
  { nome: 'Vitor Fratucci Francisco', contato: '11 99759-6678', dia: 31, inicio: '18:00', fim: '08:00' },
];

const insertAll = db.transaction(() => {
  for (const e of escalas) {
    const is24h = (e.inicio === '08:00' && e.fim === '08:00') ? 1 : 0;
    insertSchedule.run('DevOps/Cloud', e.nome, 'Analista', '1º Escalão', e.contato, e.dia, 7, 2026, e.inicio, e.fim, is24h);
  }
});
insertAll();
console.log(`  ${escalas.length} entradas de escala criadas para DevOps/Cloud (Jul/2026)`);

// === Create Periodos + Escalas (formal tables) ===
console.log('\n=== Criando períodos e escalas formais ===');
const insertPeriodo = db.prepare(`
  INSERT OR IGNORE INTO periodos (codigo, data, horarios, area_codigo, created_at, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
`);
const insertEscala = db.prepare(`
  INSERT OR IGNORE INTO escalas (codigo, area_codigo, periodo_codigo, usuario_codigo, created_at, updated_at)
  VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
`);

let periodosCreated = 0;
let escalasCreated = 0;

for (const e of escalas) {
  const dateStr = `2026-07-${String(e.dia).padStart(2, '0')}`;
  const horarios = (e.inicio === '08:00' && e.fim === '08:00') ? '24hs' : `${e.inicio} às ${e.fim}`;
  const periodoCodigo = `PER-DEVOPS-${dateStr}`;
  
  try {
    insertPeriodo.run(periodoCodigo, dateStr, horarios, 'DEVOPS_CLOUD');
    periodosCreated++;
  } catch { /* exists */ }

  // Find user
  const user = db.prepare('SELECT codigo FROM users WHERE nome = ? AND area_codigo = ?').get(e.nome, 'DEVOPS_CLOUD');
  if (user) {
    const escalaCodigo = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    try {
      insertEscala.run(escalaCodigo, 'DEVOPS_CLOUD', periodoCodigo, user.codigo);
      escalasCreated++;
    } catch { /* exists */ }
  }
}
console.log(`  ${periodosCreated} períodos, ${escalasCreated} escalas`);

// Final count
const finalUsers = db.prepare('SELECT COUNT(*) as c FROM users').get();
const finalAreas = db.prepare('SELECT COUNT(*) as c FROM areas').get();
const finalSchedules = db.prepare('SELECT COUNT(*) as c FROM escalation_schedules').get();
console.log(`\n=== RESULTADO FINAL ===`);
console.log(`  Usuários: ${finalUsers.c}`);
console.log(`  Áreas: ${finalAreas.c}`);
console.log(`  Escalation schedules: ${finalSchedules.c}`);
console.log(`\n✓ Seed concluído!`);

db.close();
