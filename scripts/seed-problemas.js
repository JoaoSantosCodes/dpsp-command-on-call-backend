/**
 * Seed de Problemas (Alertas P1) com áreas responsáveis.
 * Executa: node scripts/seed-problemas.js
 */
const Database = require('better-sqlite3');
const db = new Database('./data/command-center.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Ensure tables exist
try {
  db.exec(`CREATE TABLE IF NOT EXISTS problemas (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, descricao TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE IF NOT EXISTS problema_areas (id INTEGER PRIMARY KEY AUTOINCREMENT, problema_id INTEGER NOT NULL REFERENCES problemas(id) ON DELETE CASCADE, area_codigo TEXT NOT NULL, ordem INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')), UNIQUE(problema_id, area_codigo), UNIQUE(problema_id, ordem))`);
} catch {}

const insertProb = db.prepare(`INSERT OR IGNORE INTO problemas (codigo, descricao) VALUES (?, ?)`);
const insertArea = db.prepare(`INSERT OR IGNORE INTO problema_areas (problema_id, area_codigo, ordem) VALUES (?, ?, ?)`);

function addProblema(codigo, descricao, areas) {
  insertProb.run(codigo, descricao);
  const row = db.prepare('SELECT id FROM problemas WHERE codigo = ?').get(codigo);
  if (!row) return;
  for (let i = 0; i < areas.length; i++) {
    try { insertArea.run(row.id, areas[i], i + 1); } catch {}
  }
}

console.log('Seeding problemas (alertas P1)...');

// Cloud / DevOps
addProblema('PROB-001', 'API Gateway - Kubernetes - Alto consumo de disco no node', ['DEVOPS_CLOUD']);
addProblema('PROB-002', 'Kong - Kubernetes - OOMKill detectado no cluster', ['DEVOPS_CLOUD']);
addProblema('PROB-003', 'Kong - Kubernetes - Restart de pods no cluster', ['DEVOPS_CLOUD']);
addProblema('PROB-004', 'Cloud - Network - Direct Connect indisponível', ['REDES', 'DEVOPS_CLOUD']);
addProblema('PROB-005', 'Cloud - Network - Tráfego Direct Connect acima de 400Mbps', ['REDES', 'DEVOPS_CLOUD']);

// App Mobile
addProblema('PROB-010', 'APP Mobile - API - Latência acima de 12s', ['TORRE_SOLUCOES_DIGITAIS']);
addProblema('PROB-011', 'APP Mobile - Kubernetes - OOMKill em container', ['TORRE_SOLUCOES_DIGITAIS', 'DEVOPS_CLOUD']);
addProblema('PROB-012', 'APP Mobile - MongoDB - Alto consumo de CPU', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
addProblema('PROB-013', 'APP Mobile - Redis - Alto consumo de memória', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);

// AcompMais
addProblema('PROB-020', 'AcompMais - API - Alto número de erros nos logs', ['TORRE_SOLUCOES_DIGITAIS']);
addProblema('PROB-021', 'AcompMais - OracleDB - Alto consumo de CPU no RDS', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
addProblema('PROB-022', 'AcompMais - OracleDB - Deadlocks acima de 1', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
addProblema('PROB-023', 'AcompMais - OracleDB - Transações bloqueadas acima de 20 min', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);

// Balcão / PDV
addProblema('PROB-030', 'Balcão - API - Anomalia de erros', ['TORRE_SOLUCOES_DE_LOJAS']);
addProblema('PROB-031', 'Balcão - PDV - Aumento de taxa de erro', ['TORRE_SOLUCOES_DE_LOJAS', 'PDV']);
addProblema('PROB-032', 'Balcão - PDV - Latência de conexão acima de 10s', ['TORRE_SOLUCOES_DE_LOJAS', 'PDV']);
addProblema('PROB-033', 'Balcão - MongoDB - Conexões acima de 15000', ['TORRE_SOLUCOES_DE_LOJAS', 'INFRAESTRUTURA_DATA_CENTER']);

// GDB / Digital
addProblema('PROB-040', 'GDB - API - Authorization Confirm - Tempo de resposta alto', ['TORRE_SOLUCOES_DE_SAUDE']);
addProblema('PROB-041', 'GDB - MongoDB - Alto consumo de CPU', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
addProblema('PROB-042', 'GDB - Redis - Alto consumo de memória', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
addProblema('PROB-043', 'GDB - Lambda - Step Functions com falha', ['TORRE_SOLUCOES_DE_SAUDE', 'DEVOPS_CLOUD']);

// Syncros / Comercial
addProblema('PROB-050', 'Syncros - API - Alto número de erros nos logs', ['TORRE_SOLUCOES_COM_E_MARKETING']);
addProblema('PROB-051', 'Syncros - RDS - Alto consumo de CPU', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
addProblema('PROB-052', 'Syncros - Redis - Evictions acima de 0', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);

// OMSv3
addProblema('PROB-060', 'OMSv3 - API - Alto número de erros nos logs', ['TORRE_SOLUCOES_LOGISTICAS']);
addProblema('PROB-061', 'OMSv3 - OracleDB - Deadlocks acima de 1', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
addProblema('PROB-062', 'OMSv3 - Redis - Alto consumo de memória', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);

// Estoque Único
addProblema('PROB-070', 'Estoque Único - Delta Common Stores - Sem conexão 60 min', ['TORRE_SOLUCOES_LOGISTICAS', 'INTEGRACOES__CPI_ODI_OGG_']);
addProblema('PROB-071', 'Estoque Único - Stock Delta CDS - Anomalia de erros', ['TORRE_SOLUCOES_LOGISTICAS', 'INTEGRACOES__CPI_ODI_OGG_']);

// Farmácia
addProblema('PROB-080', 'FarmaciaV2 - OracleDB - Baixa memória disponível', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
addProblema('PROB-081', 'FarmaciaV2 - OracleDB - Conexões acima de 550', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);

// LMP
addProblema('PROB-090', 'LMP - RDS - Espaço em disco criticamente baixo', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
addProblema('PROB-091', 'LMP - RDS - Conexões acima de 1500', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);

// Infra DC genérico
addProblema('PROB-100', 'RDS - Alto consumo de CPU (genérico)', ['INFRAESTRUTURA_DATA_CENTER', 'DEVOPS_CLOUD']);
addProblema('PROB-101', 'RDS - Baixa memória disponível (genérico)', ['INFRAESTRUTURA_DATA_CENTER', 'DEVOPS_CLOUD']);

// Custom / Kubernetes
addProblema('PROB-110', 'Custom - Kubernetes - Falha na execução de CronJob', ['DEVOPS_CLOUD']);
addProblema('PROB-111', 'Custom - MongoDB - Conexões acima de 15000', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);

// Segurança
addProblema('PROB-120', 'Segurança - WAF - Tentativas de intrusão detectadas', ['SEGURANCA_DA_INFORMACAO']);

// Command Center
addProblema('PROB-130', 'Command Center - Sistema de escalonamento indisponível', ['COMMAND_CENTER', 'DEVOPS_CLOUD']);

const total = db.prepare('SELECT COUNT(*) as c FROM problemas').get();
const totalAreas = db.prepare('SELECT COUNT(*) as c FROM problema_areas').get();
console.log(`✅ ${total.c} problemas cadastrados com ${totalAreas.c} vínculos de área.`);

db.close();
