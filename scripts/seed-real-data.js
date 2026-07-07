/**
 * Seed script - Popula o banco com dados reais de escalonamento.
 * Executa: node scripts/seed-real-data.js
 */
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');

const db = new Database('./data/command-center.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const HASH = bcrypt.hashSync('plan123', 10);
const ADM_HASH = bcrypt.hashSync('admin123', 10);

// === AREAS UPDATE (torre + coordenador + gerente) ===
const AREAS_UPDATE = [
  { codigo: 'TORRE_SOLUCOES_DE_LOJAS', torre: 'Soluções Lojas', coordNome: 'Yuri Marques', coordContato: '(19) 96444-428', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },
  { codigo: 'TORRE_SOLUCOES_COM_E_MARKETING', torre: 'Soluções Comerciais e MKT', coordNome: 'Priscila Lira Alves', coordContato: '(11) 97355-7180', gerenteNome: null, gerenteContato: null },
  { codigo: 'TORRE_SOLUCOES_LOGISTICAS', torre: 'Soluções Logísticas', coordNome: 'Robson Rogerio dos Santos', coordContato: '(11) 98177-7837', gerenteNome: 'Fabricio Spano', gerenteContato: '(11) 97208-7822' },
  { codigo: 'SOLUCOES_CORPORATIVAS', torre: 'Soluções Corporativas', coordNome: 'Marcelo Almeida', coordContato: '(11) 94546-0472', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },
  { codigo: 'TORRE_SOLUCOES_DE_SAUDE', torre: 'Soluções de Saúde', coordNome: 'Victor Hideo Nagatani', coordContato: '(11) 91033-0161', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },
  { codigo: 'INTEGRACOES__CPI_ODI_OGG_', torre: 'Integrações', coordNome: 'Tarciso Franzote Perozini', coordContato: null, gerenteNome: null, gerenteContato: null },
  { codigo: 'INFRAESTRUTURA_DATA_CENTER', torre: 'Infraestrutura', coordNome: 'Andrie Ferreira Bittencourt', coordContato: '(11) 96392-0260', gerenteNome: 'Alex Almeida', gerenteContato: '(11) 99693-6308' },
  { codigo: 'REDES', torre: 'Redes', coordNome: 'Mauricio Santos Pomponet', coordContato: '(11) 94195-7625', gerenteNome: 'Marcos Marra Boldori', gerenteContato: '(11) 93259-6134' },
  { codigo: 'DEVOPS_CLOUD', torre: 'DevOps/Cloud', coordNome: 'Jair Meira Nascimento', coordContato: '(11) 99741-1892', gerenteNome: 'Alex Almeida', gerenteContato: '(11) 99693-6308' },
  { codigo: 'SEGURANCA_DA_INFORMACAO', torre: 'Segurança da Informação', coordNome: null, coordContato: null, gerenteNome: 'Sergio Castanho', gerenteContato: '(11) 96413-1405' },
  { codigo: 'COMMAND_CENTER', torre: 'Command Center', coordNome: 'Diego Carmo', coordContato: '(11) 94333-4500', gerenteNome: 'Alexandre Carvalho de Lima', gerenteContato: '(11) 98965-2816' },
  { codigo: 'BDE_ODI___MALHA_DE_PRECOS', torre: 'BDE/ODI', coordNome: null, coordContato: null, gerenteNome: null, gerenteContato: null },
];

console.log('Updating areas with torre/coordenador/gerente...');

const updateArea = db.prepare(`
  UPDATE areas SET torre = ?, coordenador_nome = ?, coordenador_contato = ?, gerente_nome = ?, gerente_contato = ?, updated_at = datetime('now')
  WHERE codigo = ?
`);

for (const a of AREAS_UPDATE) {
  updateArea.run(a.torre, a.coordNome, a.coordContato, a.gerenteNome, a.gerenteContato, a.codigo);
}

// Add Soluções Digitais area if not exists
db.prepare(`INSERT OR IGNORE INTO areas (codigo, nome, torre, coordenador_nome, coordenador_contato, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`)
  .run('TORRE_SOLUCOES_DIGITAIS', 'Torre Soluções Digitais', 'Soluções Digitais', 'Moyses Santos', '(11) 94535-4913');

console.log('Areas updated.');

// === PLANTONISTAS (users) ===
console.log('Creating plantonistas...');

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (codigo, area_codigo, nome, perfil, cargo, contato, username, senha_hash, created_at, updated_at)
  VALUES (?, ?, ?, 'Plantonista', ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

function makeUsername(nome) {
  return nome.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '').substring(0, 30);
}

let userCount = 0;
function addUser(area, nome, cargo, telefone) {
  const username = makeUsername(nome);
  const codigo = `ESC-${area.substring(0,8)}-${++userCount}`;
  insertUser.run(codigo, area, nome, cargo, telefone || null, username, HASH);
}

// Torre Soluções Lojas
addUser('TORRE_SOLUCOES_DE_LOJAS', 'Antonio Carlos dos Santos', 'Analista de Sistemas III', '(11) 98092-2278');
addUser('TORRE_SOLUCOES_DE_LOJAS', 'Luan Sant Anna', 'Analista de Sistemas II', '(11) 96472-3573');
addUser('TORRE_SOLUCOES_DE_LOJAS', 'Caio Romanato Ruiz', 'Analista de Sistemas II', '(11) 93044-6170');
addUser('TORRE_SOLUCOES_DE_LOJAS', 'Diego Barboza dos Santos', 'Analista de Projetos de TI III', null);
addUser('TORRE_SOLUCOES_DE_LOJAS', 'Felipe Guilherme Pereira Mendes', 'Analista de Sistemas III', '(81) 99975-8995');
addUser('TORRE_SOLUCOES_DE_LOJAS', 'Paulo Rogerio de Araujo', 'Analista de Projetos de TI II', '(11) 98539-6996');
addUser('TORRE_SOLUCOES_DE_LOJAS', 'Pedro Teodoro Nalini', 'Analista de Sistemas III', '(11) 97661-5226');

// Torre Soluções Digitais
addUser('TORRE_SOLUCOES_DIGITAIS', 'Moyses Santos', 'Coordenador de Engenharia de Software', '(11) 94535-4913');

// Torre Soluções Logísticas
addUser('TORRE_SOLUCOES_LOGISTICAS', 'Ricardo Ferreira Sobrinho', 'Analista de Sistemas III', '(11) 95710-1330');
addUser('TORRE_SOLUCOES_LOGISTICAS', 'Vanessa Lima da Silva', 'Analista de Sistemas III', '(11) 99501-9767');
addUser('TORRE_SOLUCOES_LOGISTICAS', 'Ademir Aparecido Ferreira do Nascimento', 'Analista de Sistemas II', '(11) 94235-1958');
addUser('TORRE_SOLUCOES_LOGISTICAS', 'Paloma Vicente de Souza Dantas', 'Analista de Sistemas II', '(11) 98537-8643');

// Torre Comercial e MKT
addUser('TORRE_SOLUCOES_COM_E_MARKETING', 'Aldemir Freitas Junior', 'Analista de Engenharia de Software III', '(16) 99291-3612');
addUser('TORRE_SOLUCOES_COM_E_MARKETING', 'Frank de Matos Simoes', 'Analista de Engenharia de Software III', '(34) 98430-1046');
addUser('TORRE_SOLUCOES_COM_E_MARKETING', 'Elton Lopes', 'Analista de Engenharia de Software III', '(85) 98921-4075');

// Torre Corporativas
addUser('SOLUCOES_CORPORATIVAS', 'Marcelo Almeida', 'Coordenador de Sistemas', '(11) 94546-0472');
addUser('SOLUCOES_CORPORATIVAS', 'Thiago Moreira', 'Coordenador de Sistemas', '(11) 94562-7211');

// Torre Saúde
addUser('TORRE_SOLUCOES_DE_SAUDE', 'Daniel Oliveira da Silva', 'Analista de Engenharia de Software II', '(11) 95116-0061');
addUser('TORRE_SOLUCOES_DE_SAUDE', 'Osmir Custodio Mariano', 'Analista de Engenharia de Software III', '(61) 98212-9338');

// Integrações
addUser('INTEGRACOES__CPI_ODI_OGG_', 'Andrea Silva Almeida', 'Analista de Engenharia de Software III', '(11) 98692-7690');
addUser('INTEGRACOES__CPI_ODI_OGG_', 'Jonathan Araujo de Sousa', 'Analista de Engenharia de Software I', '(11) 95220-7810');
addUser('INTEGRACOES__CPI_ODI_OGG_', 'Lucas Soares de Lima', 'Analista de Engenharia de Software III', '(11) 97700-3620');

// Infraestrutura DC
addUser('INFRAESTRUTURA_DATA_CENTER', 'KYNDRYL', 'Analista de Infraestrutura DC III', '(11) 98065-0105');
addUser('INFRAESTRUTURA_DATA_CENTER', 'Diego Ferreira Lima', 'Analista de Infraestrutura DC III', '(11) 94152-4889');
addUser('INFRAESTRUTURA_DATA_CENTER', 'Eliaquim Tarif Salomao Cruz', 'Analista de Infraestrutura DC II', '(11) 97549-2203');
addUser('INFRAESTRUTURA_DATA_CENTER', 'Julio Sá', 'Analista de Infraestrutura DC II', '(71) 99782-463');
addUser('INFRAESTRUTURA_DATA_CENTER', 'William da Silva Santos', 'Analista de Infraestrutura DC II', '(11) 94911-1914');

// Redes
addUser('REDES', 'Rafael Veiga Calvo', 'Analista de Infra de Redes III', '(11) 94573-2193');
addUser('REDES', 'Hebert da Paixao Santos de Souza', 'Analista de Infra de Redes I', '(11) 98952-7191');
addUser('REDES', 'Warley Silva de Oliveira', 'Analista de Infra de Redes II', '(11) 99207-4799');
addUser('REDES', 'Guilherme Henrique Goncalves', 'Analista de Infra de Redes I', '(11) 99855-4512');
addUser('REDES', 'Samuel Souza dos Santos', 'Analista de Infra de Redes III', '(11) 94486-3813');
addUser('REDES', 'Jarbas Almeida Lima', 'Analista de Infra de Redes III', '(11) 99861-2678');

// DevOps/Cloud
addUser('DEVOPS_CLOUD', 'Claudio Rogerio Ribeiro Lopes', 'Analista de DevOps III', '(14) 99137-1213');
addUser('DEVOPS_CLOUD', 'David Alves de Araujo', 'Analista de DevOps III', '(11) 98116-6555');
addUser('DEVOPS_CLOUD', 'Ricardo Tomaz Fracini', 'Analista de DevOps II', '(21) 99834-0406');
addUser('DEVOPS_CLOUD', 'Vitor Fratucci Francisco', 'Analista de DevOps I', '(11) 96911-6690');
addUser('DEVOPS_CLOUD', 'Vitor Morais Clauz', 'Analista de DevOps II', '(11) 96923-0251');

// Segurança da Informação
addUser('SEGURANCA_DA_INFORMACAO', 'Silvio Antonio Martins Traldi', 'Especialista de Segurança da Informação', '(11) 94455-6854');

// Command Center
addUser('COMMAND_CENTER', 'Thaynna Emilly', 'Consultor', '(11) 99111-8142');
addUser('COMMAND_CENTER', 'Walysson Jose Ribeiro Albuquerque', 'Consultor', '(11) 99111-8142');
addUser('COMMAND_CENTER', 'Eurico do Egito Silva', 'Analista de Suporte de TI I', '(11) 99111-8142');
addUser('COMMAND_CENTER', 'Elson Luiz Santos Gomes', 'Analista de Suporte de Infraestrutura I', '(11) 99111-8142');
addUser('COMMAND_CENTER', 'Eduardo Lucas de Lima', 'Analista de Suporte de Infraestrutura II', '(11) 99111-8142');
addUser('COMMAND_CENTER', 'João Carlos', 'Analista de Suporte de Infraestrutura I', '(11) 99111-8142');
addUser('COMMAND_CENTER', 'Murillo Castro da Silva', 'Analista de Suporte de Infraestrutura II', '(11) 99111-8142');
addUser('COMMAND_CENTER', 'Pedro Henrique Amaro Melo', 'Analista de Suporte de Infraestrutura II', '(11) 99111-8142');
addUser('COMMAND_CENTER', 'Decyo Matos', 'Analista de Suporte de Infraestrutura I', '(11) 99111-8142');
addUser('COMMAND_CENTER', 'Yurhi Berte', 'Analista de Suporte de Infraestrutura I', '(11) 99111-8142');
addUser('COMMAND_CENTER', 'Victor Viana', 'Analista de Suporte de Infraestrutura III', '(11) 97231-7458');
addUser('COMMAND_CENTER', 'Fabio Canha', 'Supervisor', '(11) 97690-3054');

// BDE/ODI - Malha de Preços
addUser('BDE_ODI___MALHA_DE_PRECOS', 'Daniel Pereira', 'Analista de Sistemas', '(85) 98125-0055');
addUser('BDE_ODI___MALHA_DE_PRECOS', 'Josimar Guedes', 'Analista de Sistemas', '(61) 82142-967');

console.log(`${userCount} plantonistas created.`);

// === ADMIN USER ===
console.log('Creating admin user...');
db.prepare(`INSERT OR IGNORE INTO users (codigo, nome, perfil, username, senha_hash, created_at, updated_at) VALUES (?, ?, 'Adm', ?, ?, datetime('now'), datetime('now'))`)
  .run('ADM-001', 'Administrador', 'admin', ADM_HASH);

// === RESPONSAVEIS (coordinators as Responsavel users) ===
console.log('Creating responsavel users...');
const insertResp = db.prepare(`
  INSERT OR IGNORE INTO users (codigo, area_codigo, nome, perfil, cargo, contato, username, senha_hash, created_at, updated_at)
  VALUES (?, ?, ?, 'Responsavel', ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

const RESPONSAVEIS = [
  { area: 'TORRE_SOLUCOES_DE_LOJAS', nome: 'Yuri Marques', cargo: 'Coordenador de Projetos de TI', contato: '(19) 96444-428' },
  { area: 'TORRE_SOLUCOES_DIGITAIS', nome: 'Renata Silva', cargo: 'Líder Torre Digitais', contato: null },
  { area: 'TORRE_SOLUCOES_LOGISTICAS', nome: 'Robson Rogerio dos Santos', cargo: 'Coordenador', contato: '(11) 98177-7837' },
  { area: 'TORRE_SOLUCOES_COM_E_MARKETING', nome: 'Priscila Lira Alves', cargo: 'Coordenador de Sistemas', contato: '(11) 97355-7180' },
  { area: 'SOLUCOES_CORPORATIVAS', nome: 'William Mendonça', cargo: 'Gerente Executivo', contato: '(11) 94554-4585' },
  { area: 'TORRE_SOLUCOES_DE_SAUDE', nome: 'Victor Hideo Nagatani', cargo: 'Coordenador de Sistemas', contato: '(11) 91033-0161' },
  { area: 'INTEGRACOES__CPI_ODI_OGG_', nome: 'Tarciso Franzote Perozini', cargo: 'Coordenador de Engenharia de Software', contato: null },
  { area: 'INFRAESTRUTURA_DATA_CENTER', nome: 'Andrie Ferreira Bittencourt', cargo: 'Coordenador de Infraestrutura DC', contato: '(11) 96392-0260' },
  { area: 'REDES', nome: 'Mauricio Santos Pomponet', cargo: 'Supervisor de Infra de Redes', contato: '(11) 94195-7625' },
  { area: 'DEVOPS_CLOUD', nome: 'Jair Meira Nascimento', cargo: 'Coordenador de Cloud & DevOps', contato: '(11) 99741-1892' },
  { area: 'COMMAND_CENTER', nome: 'Diego Carmo', cargo: 'Coordenador', contato: '(11) 94333-4500' },
];

let respCount = 0;
for (const r of RESPONSAVEIS) {
  const username = makeUsername(r.nome) + '.resp';
  const codigo = `RESP-${++respCount}`;
  insertResp.run(codigo, r.area, r.nome, r.cargo, r.contato, username, bcrypt.hashSync('resp123', 10));
}
console.log(`${respCount} responsaveis created.`);

// === AREA ESCALATION CHAINS ===
console.log('Creating escalation chains...');

const insertChain = db.prepare(`
  INSERT OR IGNORE INTO area_escalation_chains (area_codigo, person_name, person_contact, position)
  VALUES (?, ?, ?, ?)
`);

const CHAINS = {
  'TORRE_SOLUCOES_DE_LOJAS': [
    { nome: 'Antonio Carlos dos Santos', contato: '(11) 98092-2278', pos: 1 },
    { nome: 'Yuri Marques', contato: '(19) 96444-428', pos: 2 },
    { nome: 'William Mendonça', contato: '(11) 94554-4585', pos: 3 },
  ],
  'TORRE_SOLUCOES_DIGITAIS': [
    { nome: 'Moyses Santos', contato: '(11) 94535-4913', pos: 1 },
  ],
  'TORRE_SOLUCOES_LOGISTICAS': [
    { nome: 'Ricardo Ferreira Sobrinho', contato: '(11) 95710-1330', pos: 1 },
    { nome: 'Robson Rogerio dos Santos', contato: '(11) 98177-7837', pos: 2 },
    { nome: 'Alessandro Lucas Soares', contato: '(11) 97208-7822', pos: 3 },
    { nome: 'Fabricio Spano', contato: '(11) 97208-7822', pos: 4 },
  ],
  'TORRE_SOLUCOES_COM_E_MARKETING': [
    { nome: 'Aldemir Freitas Junior', contato: '(16) 99291-3612', pos: 1 },
    { nome: 'Priscila Lira Alves', contato: '(11) 97355-7180', pos: 2 },
  ],
  'SOLUCOES_CORPORATIVAS': [
    { nome: 'Marcelo Almeida', contato: '(11) 94546-0472', pos: 1 },
    { nome: 'Thiago Moreira', contato: '(11) 94562-7211', pos: 1 },
    { nome: 'William Mendonça', contato: '(11) 94554-4585', pos: 2 },
  ],
  'TORRE_SOLUCOES_DE_SAUDE': [
    { nome: 'Daniel Oliveira da Silva', contato: '(11) 95116-0061', pos: 1 },
    { nome: 'Osmir Custodio Mariano', contato: '(61) 98212-9338', pos: 1 },
    { nome: 'Victor Hideo Nagatani', contato: '(11) 91033-0161', pos: 2 },
  ],
  'INTEGRACOES__CPI_ODI_OGG_': [
    { nome: 'Andrea Silva Almeida', contato: '(11) 98692-7690', pos: 1 },
    { nome: 'Jonathan Araujo de Sousa', contato: '(11) 95220-7810', pos: 1 },
    { nome: 'Lucas Soares de Lima', contato: '(11) 97700-3620', pos: 1 },
    { nome: 'Tarciso Franzote Perozini', contato: null, pos: 2 },
  ],
  'INFRAESTRUTURA_DATA_CENTER': [
    { nome: 'KYNDRYL', contato: '(11) 98065-0105', pos: 1 },
    { nome: 'Diego Ferreira Lima', contato: '(11) 94152-4889', pos: 2 },
    { nome: 'Andrie Ferreira Bittencourt', contato: '(11) 96392-0260', pos: 3 },
    { nome: 'Alex Almeida', contato: '(11) 99693-6308', pos: 4 },
  ],
  'REDES': [
    { nome: 'Rafael Veiga Calvo', contato: '(11) 94573-2193', pos: 1 },
    { nome: 'Samuel Souza dos Santos', contato: '(11) 94486-3813', pos: 2 },
    { nome: 'Mauricio Santos Pomponet', contato: '(11) 94195-7625', pos: 3 },
    { nome: 'Marcos Marra Boldori', contato: '(11) 93259-6134', pos: 4 },
  ],
};

const CHAINS2 = {
  'DEVOPS_CLOUD': [
    { nome: 'Claudio Rogerio Ribeiro Lopes', contato: '(14) 99137-1213', pos: 1 },
    { nome: 'David Alves de Araujo', contato: '(11) 98116-6555', pos: 1 },
    { nome: 'Jair Meira Nascimento', contato: '(11) 99741-1892', pos: 2 },
    { nome: 'Alex Almeida', contato: '(11) 99693-6308', pos: 3 },
  ],
  'SEGURANCA_DA_INFORMACAO': [
    { nome: 'Silvio Antonio Martins Traldi', contato: '(11) 94455-6854', pos: 1 },
    { nome: 'Sergio Castanho', contato: '(11) 96413-1405', pos: 2 },
  ],
  'COMMAND_CENTER': [
    { nome: 'Thaynna Emilly', contato: '(11) 99111-8142', pos: 1 },
    { nome: 'Victor Viana', contato: '(11) 97231-7458', pos: 2 },
    { nome: 'Fabio Canha', contato: '(11) 97690-3054', pos: 2 },
    { nome: 'Diego Carmo', contato: '(11) 94333-4500', pos: 3 },
    { nome: 'Alexandre Carvalho de Lima', contato: '(11) 98965-2816', pos: 4 },
  ],
  'BDE_ODI___MALHA_DE_PRECOS': [
    { nome: 'Daniel Pereira', contato: '(85) 98125-0055', pos: 1 },
    { nome: 'Josimar Guedes', contato: '(61) 82142-967', pos: 1 },
  ],
};

const allChains = { ...CHAINS, ...CHAINS2 };
let chainCount = 0;
// Clear existing chains first
db.prepare('DELETE FROM area_escalation_chains').run();
for (const [areaCodigo, members] of Object.entries(allChains)) {
  for (const m of members) {
    insertChain.run(areaCodigo, m.nome, m.contato, m.pos);
    chainCount++;
  }
}
console.log(`${chainCount} escalation chain entries created.`);

// === DONE ===
db.close();
console.log('\n✅ Seed complete! All real data populated.');
console.log('Login: admin / admin123 (Adm)');
console.log('Login: [nome].resp / resp123 (Responsavel)');
console.log('Login: [nome] / plan123 (Plantonista)');
