// Cadastrar TODOS os plantonistas de todas as torres/áreas conforme documentação
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data', 'command-center.db'));
db.pragma('foreign_keys = OFF');
const senhaHash = bcrypt.hashSync('plantonista123', 10);

// Limpar plantonistas antigos para recadastrar corretamente
db.prepare('DELETE FROM users WHERE perfil = ?').run('Plantonista');

const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (codigo, area_codigo, nome, perfil, nivel_escalonamento, cargo, contato, username, senha_hash, ativo, aprovado, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, datetime('now'), datetime('now'))
`);

function addUser(area, nome, cargo, contato, nivel) {
  const username = nome.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '')
    .substring(0, 30);
  const codigo = `USR-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
  insertUser.run(codigo, area, nome, 'Plantonista', nivel, cargo, contato, username, senhaHash);
}

console.log('Cadastrando todos os plantonistas...\n');

// === SOLUÇÕES LOJAS ===
console.log('📦 Soluções Lojas');
addUser('ATENDIMENTO_LOJAS', 'Antonio Carlos dos Santos', 'Analista de Sistemas III', '(11) 98092-2278', '1º Escalão');
addUser('ATENDIMENTO_LOJAS', 'Luan Sant Anna', 'Analista de Sistemas II', '(11) 96472-3573', '1º Escalão');
addUser('ATENDIMENTO_LOJAS', 'Caio Romanato Ruiz', 'Analista de Sistemas II', '(11) 93044-6170', '1º Escalão');
addUser('ATENDIMENTO_LOJAS', 'Diego Barboza dos Santos', 'Analista de Projetos de TI III', null, '1º Escalão');
addUser('ATENDIMENTO_LOJAS', 'Felipe Guilherme Pereira Mendes', 'Analista de Sistemas III', '(81) 99975-8995', '1º Escalão');
addUser('ATENDIMENTO_LOJAS', 'Paulo Rogerio de Araujo', 'Analista de Projetos de TI II', '(11) 98539-6996', '1º Escalão');
addUser('ATENDIMENTO_LOJAS', 'Pedro Teodoro Nalini', 'Analista de Sistemas III', '(11) 97661-5226', '1º Escalão');
addUser('ATENDIMENTO_LOJAS', 'Yuri Marques', 'Coordenador de Projetos de TI', '(19) 96444-428', '2º Escalão');
addUser('ATENDIMENTO_LOJAS', 'William Mendonça', 'Gerente Executivo', '(11) 94554-4585', '3º Escalão');

// === SOLUÇÕES DIGITAIS ===
console.log('🛒 Soluções Digitais');
addUser('TORRE_SOLUCOES_DIGITAIS', 'Moyses Santos', 'Coordenador de Engenharia de Software', '(11) 94535-4913', '1º Escalão');

// === SOLUÇÕES LOGÍSTICAS ===
console.log('🚚 Soluções Logísticas');
addUser('LOGISTICA_WMS', 'Ricardo Ferreira Sobrinho', 'Analista de Sistemas III', '(11) 95710-1330', '1º Escalão');
addUser('LOGISTICA_WMS', 'Vanessa Lima da Silva', 'Analista de Sistemas III', '(11) 99501-9767', '1º Escalão');
addUser('LOGISTICA_WMS', 'Ademir Aparecido Ferreira do Nascimento', 'Analista de Sistemas II', '(11) 94235-1958', '1º Escalão');
addUser('LOGISTICA_WMS', 'Paloma Vicente de Souza Dantas', 'Analista de Sistemas II', '(11) 98537-8643', '1º Escalão');
addUser('LOGISTICA_WMS', 'Robson Rogerio dos Santos', 'Coordenador', '(11) 98177-7837', '2º Escalão');
addUser('LOGISTICA_WMS', 'Alessandro Lucas Soares', 'Coordenador de Sistemas', '(11) 97208-7822', '3º Escalão');
addUser('LOGISTICA_WMS', 'Fabricio Spano', 'Gerente', '(11) 97208-7822', '4º Escalão');

// === SOLUÇÕES COMERCIAIS E MKT ===
console.log('💰 Soluções Comerciais e MKT');
addUser('TORRE_SOLUCOES_COM_E_MARKETING', 'Aldemir Freitas Junior', 'Analista de Engenharia de Software III', '(16) 99291-3612', 'Direto');
addUser('TORRE_SOLUCOES_COM_E_MARKETING', 'Frank de Matos Simoes', 'Analista de Engenharia de Software III', '(34) 98430-1046', 'Direto');
addUser('TORRE_SOLUCOES_COM_E_MARKETING', 'Elton Lopes', 'Analista de Engenharia de Software III', '(85) 98921-4075', 'Direto');
addUser('TORRE_SOLUCOES_COM_E_MARKETING', 'Priscila Lira Alves', 'Coordenador de Sistemas', '(11) 97355-7180', '1º Escalão');

// === SOLUÇÕES CORPORATIVAS ===
console.log('📊 Soluções Corporativas');
addUser('SOLUCOES_CORPORATIVAS', 'Marcelo Almeida', 'Coordenador de Sistemas', '(11) 94546-0472', '1º Escalão');
addUser('SOLUCOES_CORPORATIVAS', 'Thiago Moreira', 'Coordenador de Sistemas', '(11) 94562-7211', '1º Escalão');
addUser('SOLUCOES_CORPORATIVAS', 'William Mendonça', 'Gerente Executivo', '(11) 94554-4585', '2º Escalão');

// === SOLUÇÕES DE SAÚDE ===
console.log('💊 Soluções de Saúde');
addUser('GDB_SAUDE', 'Daniel Oliveira da Silva', 'Analista de Engenharia de Software II', '(11) 95116-0061', '1º Escalão');
addUser('GDB_SAUDE', 'Osmir Custodio Mariano', 'Analista de Engenharia de Software III', '(61) 98212-9338', '1º Escalão');
addUser('GDB_SAUDE', 'Victor Hideo Nagatani', 'Coordenador de Sistemas', '(11) 91033-0161', '2º Escalão');

// === INTEGRAÇÕES ===
console.log('🔗 Integrações');
addUser('INTEGRACOES__CPI_ODI_OGG_', 'Andrea Silva Almeida', 'Analista de Engenharia de Software III', '(11) 98692-7690', '1º Escalão');
addUser('INTEGRACOES__CPI_ODI_OGG_', 'Jonathan Araujo de Sousa', 'Analista de Engenharia de Software I', '(11) 95220-7810', '1º Escalão');
addUser('INTEGRACOES__CPI_ODI_OGG_', 'Lucas Soares de Lima', 'Analista de Engenharia de Software III', '(11) 97700-3620', '1º Escalão');
addUser('INTEGRACOES__CPI_ODI_OGG_', 'Tarciso Franzote Perozini', 'Coordenador de Engenharia de Software', null, '2º Escalão');

// === INFRAESTRUTURA DATA CENTER ===
console.log('🗄️ Infraestrutura Data Center');
addUser('INFRAESTRUTURA_DATA_CENTER', 'KYNDRYL', 'Analista de Infraestrutura DC III', '(11) 98065-0105', '1º Escalão');
addUser('INFRAESTRUTURA_DATA_CENTER', 'Diego Ferreira Lima', 'Analista de Infraestrutura DC III', '(11) 94152-4889', '2º Escalão');
addUser('INFRAESTRUTURA_DATA_CENTER', 'Eliaquim Tarif Salomao Cruz', 'Analista de Infraestrutura DC II', '(11) 97549-2203', '2º Escalão');
addUser('INFRAESTRUTURA_DATA_CENTER', 'Julio Sa', 'Analista de Infraestrutura DC II', '(71) 99782-463', '2º Escalão');
addUser('INFRAESTRUTURA_DATA_CENTER', 'William da Silva Santos', 'Analista de Infraestrutura DC II', '(11) 94911-1914', '2º Escalão');
addUser('INFRAESTRUTURA_DATA_CENTER', 'Andrie Ferreira Bittencourt', 'Coordenador de Infraestrutura DC', '(11) 96392-0260', '3º Escalão');
addUser('INFRAESTRUTURA_DATA_CENTER', 'Alex Almeida', 'Gerente', '(11) 99693-6308', '4º Escalão');

// === REDES ===
console.log('🌐 Redes');
addUser('REDES', 'Rafael Veiga Calvo', 'Analista de Infra de Redes III', '(11) 94573-2193', '1º Escalão');
addUser('REDES', 'Hebert da Paixao Santos de Souza', 'Analista de Infra de Redes I', '(11) 98952-7191', '1º Escalão');
addUser('REDES', 'Warley Silva de Oliveira', 'Analista de Infra de Redes II', '(11) 99207-4799', '1º Escalão');
addUser('REDES', 'Guilherme Henrique Goncalves', 'Analista de Infra de Redes I', '(11) 99855-4512', '1º Escalão');
addUser('REDES', 'Samuel Souza dos Santos', 'Analista de Infra de Redes III', '(11) 94486-3813', '2º Escalão');
addUser('REDES', 'Jarbas Almeida Lima', 'Analista de Infra de Redes III', '(11) 99861-2678', '2º Escalão');
addUser('REDES', 'Mauricio Santos Pomponet', 'Supervisor de Infra de Redes', '(11) 94195-7625', '3º Escalão');
addUser('REDES', 'Marcos Marra Boldori', 'Gerente de Infra de Redes', '(11) 93259-6134', '4º Escalão');

// === DEVOPS / CLOUD ===
console.log('☁️ DevOps / Cloud');
addUser('DEVOPS_CLOUD', 'Claudio Rogerio Ribeiro Lopes', 'Analista de DevOps III', '(14) 99137-1213', '1º Escalão');
addUser('DEVOPS_CLOUD', 'David Alves de Araujo', 'Analista de DevOps III', '(11) 98116-6555', '1º Escalão');
addUser('DEVOPS_CLOUD', 'Ricardo Tomaz Fracini', 'Analista de DevOps II', '(21) 99834-0406', '1º Escalão');
addUser('DEVOPS_CLOUD', 'Vitor Fratucci Francisco', 'Analista de DevOps I', '(11) 96911-6690', '1º Escalão');
addUser('DEVOPS_CLOUD', 'Vitor Morais Clauz', 'Analista de DevOps II', '(11) 96923-0251', '1º Escalão');
addUser('DEVOPS_CLOUD', 'Jair Meira Nascimento', 'Coordenador de Cloud & DevOps', '(11) 99741-1892', '2º Escalão');
addUser('DEVOPS_CLOUD', 'Alex Almeida', 'Gerente', '(11) 99693-6308', '3º Escalão');

// === SEGURANÇA DA INFORMAÇÃO ===
console.log('🛡️ Segurança da Informação');
addUser('SEGURANCA_DA_INFORMACAO', 'Silvio Antonio Martins Traldi', 'Especialista de Segurança da Informação', '(11) 94455-6854', '1º Escalão');
addUser('SEGURANCA_DA_INFORMACAO', 'Sergio Castanho', 'Gerente de Segurança da Informação', '(11) 96413-1405', '2º Escalão');

// === COMMAND CENTER ===
console.log('🖥️ Command Center');
addUser('COMMAND_CENTER', 'Thaynna Emilly', 'Consultor', '(11) 99111-8142', '1º Escalão');
addUser('COMMAND_CENTER', 'Walysson Jose Ribeiro Albuquerque', 'Consultor', '(11) 99111-8142', '1º Escalão');
addUser('COMMAND_CENTER', 'Eurico do Egito Silva', 'Analista de Suporte de TI I', '(11) 99111-8142', '1º Escalão');
addUser('COMMAND_CENTER', 'Elson Luiz Santos Gomes', 'Analista de Suporte de Infraestrutura I', '(11) 99111-8142', '1º Escalão');
addUser('COMMAND_CENTER', 'Eduardo Lucas de Lima', 'Analista de Suporte de Infraestrutura II', '(11) 99111-8142', '1º Escalão');
addUser('COMMAND_CENTER', 'Joao Carlos', 'Analista de Suporte de Infraestrutura I', '(11) 99111-8142', '1º Escalão');
addUser('COMMAND_CENTER', 'Murillo Castro da Silva', 'Analista de Suporte de Infraestrutura II', '(11) 99111-8142', '1º Escalão');
addUser('COMMAND_CENTER', 'Pedro Henrique Amaro Melo', 'Analista de Suporte de Infraestrutura II', '(11) 99111-8142', '1º Escalão');
addUser('COMMAND_CENTER', 'Decyo Matos', 'Analista de Suporte de Infraestrutura I', '(11) 99111-8142', '1º Escalão');
addUser('COMMAND_CENTER', 'Yurhi Berte', 'Analista de Suporte de Infraestrutura I', '(11) 99111-8142', '1º Escalão');
addUser('COMMAND_CENTER', 'Victor Viana', 'Analista de Suporte de Infraestrutura III', '(11) 97231-7458', '2º Escalão');
addUser('COMMAND_CENTER', 'Fabio Canha', 'Supervisor', '(11) 97690-3054', '2º Escalão');
addUser('COMMAND_CENTER', 'Diego Carmo', 'Coordenador', '(11) 94333-4500', '3º Escalão');
addUser('COMMAND_CENTER', 'Alexandre Carvalho de Lima', 'Gerente', '(11) 98965-2816', '4º Escalão');

// === BDE/ODI ===
console.log('💲 BDE/ODI - Malha de Preços');
addUser('BDE_ODI___MALHA_DE_PRECOS', 'Daniel Pereira', 'Analista de Sistemas', '(85) 98125-0055', 'Direto');
addUser('BDE_ODI___MALHA_DE_PRECOS', 'Josimar Guedes', 'Analista de Sistemas', '(61) 82142-967', 'Direto');

// === PDV (já existem do seed anterior, adicionar os que faltam) ===
console.log('🏪 PDV');
addUser('PDV', 'Felipe Guilherme Pereira Mendes', 'Analista de Sistemas III', '(81) 99975-8995', '1º Escalão');
addUser('PDV', 'Paulo Rogerio de Araujo', 'Analista de Projetos de TI II', '(11) 98539-6996', '1º Escalão');
addUser('PDV', 'Diego Barboza dos Santos', 'Analista de Projetos de TI III', null, '1º Escalão');

// === BALCÃO ===
console.log('🏪 Balcão');
addUser('BALCAO', 'Antonio Carlos dos Santos', 'Analista de Sistemas III', '(11) 98092-2278', '1º Escalão');
addUser('BALCAO', 'Luan Sant Anna', 'Analista de Sistemas II', '(11) 96472-3573', '1º Escalão');

// Summary
db.pragma('foreign_keys = ON');
const total = db.prepare('SELECT COUNT(*) as c FROM users WHERE perfil = ?').get('Plantonista');
const byArea = db.prepare("SELECT area_codigo, COUNT(*) as c FROM users WHERE perfil = 'Plantonista' GROUP BY area_codigo ORDER BY c DESC").all();

console.log(`\n✓ ${total.c} plantonistas cadastrados`);
console.log('\nPor área:');
for (const a of byArea) {
  const area = db.prepare('SELECT nome FROM areas WHERE codigo = ?').get(a.area_codigo);
  console.log(`  ${area ? area.nome : a.area_codigo}: ${a.c}`);
}

db.close();
