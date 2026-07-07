/**
 * Seed COMPLETO de todos os 120 alertas P1 do Datadog.
 * Executa: node scripts/seed-alertas-completo.js
 */
const Database = require('better-sqlite3');
const db = new Database('./data/command-center.db');
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // Disable temporarily for cleanup

// Ensure tables
try {
  db.exec(`CREATE TABLE IF NOT EXISTS problemas (id INTEGER PRIMARY KEY AUTOINCREMENT, codigo TEXT NOT NULL UNIQUE, descricao TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
  db.exec(`CREATE TABLE IF NOT EXISTS problema_areas (id INTEGER PRIMARY KEY AUTOINCREMENT, problema_id INTEGER NOT NULL, area_codigo TEXT NOT NULL, ordem INTEGER NOT NULL, created_at TEXT DEFAULT (datetime('now')), UNIQUE(problema_id, area_codigo))`);
} catch {}

// Clear existing
db.prepare('DELETE FROM problema_areas').run();
db.prepare('DELETE FROM problemas').run();

const insertP = db.prepare('INSERT INTO problemas (codigo, descricao) VALUES (?, ?)');
const insertA = db.prepare('INSERT OR IGNORE INTO problema_areas (problema_id, area_codigo, ordem) VALUES (?, ?, ?)');

let count = 0;
function add(codigo, descricao, areas) {
  insertP.run(codigo, descricao);
  const row = db.prepare('SELECT id FROM problemas WHERE codigo = ?').get(codigo);
  if (!row) return;
  for (let i = 0; i < areas.length; i++) {
    try { insertA.run(row.id, areas[i], i + 1); } catch {}
  }
  count++;
}

// AREA CODES: DEVOPS_CLOUD, INFRAESTRUTURA_DATA_CENTER, REDES, TORRE_SOLUCOES_DE_SAUDE,
// INTEGRACOES__CPI_ODI_OGG_, TORRE_SOLUCOES_COM_E_MARKETING, TORRE_SOLUCOES_LOGISTICAS,
// TORRE_SOLUCOES_DE_LOJAS, TORRE_SOLUCOES_DIGITAIS, SEGURANCA_DA_INFORMACAO, COMMAND_CENTER,
// SOLUCOES_CORPORATIVAS, PDV, BALCAO, BDE_ODI___MALHA_DE_PRECOS

console.log('Seeding 120 alertas P1...');

// === CLOUD / KONG / API GATEWAY ===
add('P1-001', 'API Gateway - Kubernetes - Alto consumo de disco no node', ['DEVOPS_CLOUD']);
add('P1-002', 'Kong - Kubernetes - OOMKill detectado no cluster', ['DEVOPS_CLOUD']);
add('P1-003', 'Kong - Kubernetes - Restart de pods no cluster', ['DEVOPS_CLOUD']);
add('P1-004', 'Cloud - Network - Direct Connect indisponível', ['REDES', 'DEVOPS_CLOUD']);
add('P1-005', 'Cloud - Network - Tráfego Direct Connect acima de 400Mbps', ['REDES', 'DEVOPS_CLOUD']);

// === APP MOBILE (12) ===
add('P1-010', 'APP Mobile - API - Latência acima de 12s', ['TORRE_SOLUCOES_DIGITAIS']);
add('P1-011', 'APP Mobile - DNS - Erro de resolução no bff-mobile', ['TORRE_SOLUCOES_DIGITAIS', 'TORRE_SOLUCOES_DE_SAUDE']);
add('P1-012', 'APP Mobile - Kubernetes - OOMKill detectado em container', ['TORRE_SOLUCOES_DIGITAIS', 'DEVOPS_CLOUD']);
add('P1-013', 'APP Mobile - MongoDB - Alto consumo de CPU', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-014', 'APP Mobile - MongoDB - Alto consumo de memória', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-015', 'APP Mobile - MongoDB - Conexões acima de 15000', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-016', 'APP Mobile - Redis - Alto consumo de memória', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-017', 'APP Mobile - Redis - Baixa memória disponível', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-018', 'APP Mobile - Redis - Conexões abaixo de 10', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-019', 'APP Mobile - Redis - Evictions acima de 0', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-020', 'APP Mobile - Redis - Replication Lag acima de 5s', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-021', 'APP Mobile - Redis - Uso de swap acima de 0', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);

// === ACOMPMAIS (12) ===
add('P1-030', 'AcompMais - API - Alto número de erros nos logs', ['TORRE_SOLUCOES_DIGITAIS']);
add('P1-031', 'AcompMais - API - Tempo de resposta POST /orders/change acima de 45s', ['TORRE_SOLUCOES_DIGITAIS']);
add('P1-032', 'AcompMais - FrontEnd - Tempo de resposta acima de 10s', ['TORRE_SOLUCOES_DIGITAIS']);
add('P1-033', 'AcompMais - OracleDB - Acima de 500 conexões no RDS', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-034', 'AcompMais - OracleDB - Alto consumo de CPU no RDS', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-035', 'AcompMais - OracleDB - Average Active Sessions acima de 70', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-036', 'AcompMais - OracleDB - Baixa memória disponível no RDS', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-037', 'AcompMais - OracleDB - Baixo espaço no disco do RDS', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-038', 'AcompMais - OracleDB - Deadlocks acima de 1', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-039', 'AcompMais - OracleDB - Sessões em espera de CPU acima de 10', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-040', 'AcompMais - OracleDB - Transações bloqueadas acima de 20 min', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-041', 'AcompMais - OracleDB - Wait Row Lock Contention acima de 5', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);

// === BALCÃO (10) ===
add('P1-050', 'Balcão - API - Anomalia de erros', ['TORRE_SOLUCOES_DE_LOJAS']);
add('P1-051', 'Balcão - API - Erro na Smart Balcão API', ['TORRE_SOLUCOES_DE_LOJAS']);
add('P1-052', 'Balcão - API - Erro no microsserviço bff-produtos-api', ['TORRE_SOLUCOES_DE_LOJAS']);
add('P1-053', 'Balcão - DNS - Erro de resolução detectado', ['TORRE_SOLUCOES_DE_LOJAS', 'REDES']);
add('P1-054', 'Balcão - MongoDB - Alto consumo de memória', ['TORRE_SOLUCOES_DE_LOJAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-055', 'Balcão - MongoDB - Conexões acima de 15000', ['TORRE_SOLUCOES_DE_LOJAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-056', 'Balcão - PDV - Aumento de taxa de erro no PDV', ['TORRE_SOLUCOES_DE_LOJAS']);
add('P1-057', 'Balcão - PDV - Latência de conexão acima de 10s', ['TORRE_SOLUCOES_DE_LOJAS']);
add('P1-058', 'Balcão - RUM - Alta taxa de erros no frontend', ['TORRE_SOLUCOES_DE_LOJAS']);
add('P1-059', 'Balcão - Smart API - Latência acima do limite', ['TORRE_SOLUCOES_DE_LOJAS']);

// === BRIGADA (2) ===
add('P1-060', 'Brigada - MongoDB - Conexões acima de 1350', ['TORRE_SOLUCOES_DE_LOJAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-061', 'Brigada - Sem hit de conexão do PDV com POST /validade/reserva', ['TORRE_SOLUCOES_DE_LOJAS', 'INTEGRACOES__CPI_ODI_OGG_']);

// === CUSTOM / INTEGRAÇÕES (11) ===
add('P1-070', 'Custom - Alto tempo de execução de CronJobs Flash de Vendas', ['INTEGRACOES__CPI_ODI_OGG_', 'DEVOPS_CLOUD']);
add('P1-071', 'Custom - Kubernetes - Falha na execução de CronJob', ['DEVOPS_CLOUD']);
add('P1-072', 'Custom - MongoDB - Alto consumo de CPU', ['INTEGRACOES__CPI_ODI_OGG_', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-073', 'Custom - MongoDB - Conexões acima de 15000', ['INTEGRACOES__CPI_ODI_OGG_', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-074', 'Custom - Redis - Alto consumo de memória', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-075', 'Custom - Redis - Baixa memória disponível', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-076', 'Custom - Redis - Evictions acima de 0', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-077', 'Custom - Redis - Replication Lag acima de 5s', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-078', 'DocumentDB - backoffice-meuvivasaude - Alto consumo de CPU', ['TORRE_SOLUCOES_DE_SAUDE', 'DEVOPS_CLOUD']);
add('P1-079', 'Estoque Único - Delta Common Stores - Sem conexão 60 min', ['TORRE_SOLUCOES_LOGISTICAS', 'INTEGRACOES__CPI_ODI_OGG_']);
add('P1-080', 'Estoque Único - Stock Delta CDS - Anomalia de erros', ['TORRE_SOLUCOES_LOGISTICAS', 'INTEGRACOES__CPI_ODI_OGG_']);

// === FARMÁCIA (2) ===
add('P1-081', 'FarmaciaV2 - OracleDB - Baixa memória disponível', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-082', 'FarmaciaV2 - OracleDB - Conexões acima de 550', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);

// === GDB (17) ===
add('P1-090', 'GDB - API - Authorization Confirm - Tempo de resposta alto', ['TORRE_SOLUCOES_DE_SAUDE']);
add('P1-091', 'GDB - API - Pre Authorization - Tempo de resposta alto', ['TORRE_SOLUCOES_DE_SAUDE']);
add('P1-092', 'GDB - DNS - Erro de resolução detectado', ['TORRE_SOLUCOES_DE_SAUDE', 'REDES']);
add('P1-093', 'GDB - Lambda - Falha na execução de Step Function', ['TORRE_SOLUCOES_DE_SAUDE', 'DEVOPS_CLOUD']);
add('P1-094', 'GDB - Lambda - Step Functions abortadas', ['TORRE_SOLUCOES_DE_SAUDE', 'DEVOPS_CLOUD']);
add('P1-095', 'GDB - Lambda - Step Functions com falha', ['TORRE_SOLUCOES_DE_SAUDE', 'DEVOPS_CLOUD']);
add('P1-096', 'GDB - Lambda - Step Functions com throttling', ['TORRE_SOLUCOES_DE_SAUDE', 'DEVOPS_CLOUD']);
add('P1-097', 'GDB - Lambda - Step Functions com timeout', ['TORRE_SOLUCOES_DE_SAUDE', 'DEVOPS_CLOUD']);
add('P1-098', 'GDB - MongoDB - Alto consumo de CPU', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-099', 'GDB - MongoDB - Conexões acima de 15000', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-100', 'GDB - RDS - Baixa memória disponível', ['TORRE_SOLUCOES_DE_SAUDE', 'DEVOPS_CLOUD']);
add('P1-101', 'GDB - RDS - Conexões acima de 4000', ['TORRE_SOLUCOES_DE_SAUDE', 'DEVOPS_CLOUD']);
add('P1-102', 'GDB - Redis - Alto consumo de memória', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-103', 'GDB - Redis - Baixa memória disponível', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-104', 'GDB - Redis - Conexões acima de 50-60K', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-105', 'GDB - Redis - Evictions acima de 0', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-106', 'GDB - Redis - Replication Lag acima de 5s', ['TORRE_SOLUCOES_DE_SAUDE', 'INFRAESTRUTURA_DATA_CENTER']);

// === GLPI (8) ===
add('P1-110', 'GLPI - Cloud - Alto consumo de CPU no host NODE-1', ['DEVOPS_CLOUD']);
add('P1-111', 'GLPI - Cloud - Alto consumo de CPU no host NODE-2', ['DEVOPS_CLOUD']);
add('P1-112', 'GLPI - Cloud - Alto consumo de CPU no host PROXY', ['DEVOPS_CLOUD']);
add('P1-113', 'GLPI - Cloud - Uso de memória baixo no host NODE-2', ['DEVOPS_CLOUD']);
add('P1-114', 'GLPI - RDS - Conexões acima de 550', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-115', 'GLPI - RDS - Conexões da réplica acima de 550', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-116', 'GLPI - RDS - dbglpiprod - Baixa memória disponível', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-117', 'GLPI - RDS - dbglpiprod-replica - Baixa memória', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);

// === INNOVARE (2) ===
add('P1-118', 'Innovare - API - Latência acima de 12s', ['INTEGRACOES__CPI_ODI_OGG_']);
add('P1-119', 'Innovare - MongoDB - Conexões acima de 1350', ['INTEGRACOES__CPI_ODI_OGG_', 'INFRAESTRUTURA_DATA_CENTER']);

// === LMP (4) ===
add('P1-120', 'LMP - RDS - Anomalia no uso de CPU', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-121', 'LMP - RDS - Baixa memória disponível', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-122', 'LMP - RDS - Conexões acima de 1500', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-123', 'LMP - RDS - Espaço em disco criticamente baixo', ['TORRE_SOLUCOES_DIGITAIS', 'INFRAESTRUTURA_DATA_CENTER']);

// === N8N (3) ===
add('P1-124', 'N8N - RDS - Baixa memória disponível', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-125', 'N8N - RDS - Conexões acima de 220', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-126', 'N8N - Redis - Evictions acima de 0', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);

// === OMSv3 (17) ===
add('P1-130', 'OMSv3 - API - Alto número de erros nos logs', ['TORRE_SOLUCOES_LOGISTICAS']);
add('P1-131', 'OMSv3 - OracleDB - Alto consumo de CPU no OMS-Carteira', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-132', 'OMSv3 - OracleDB - Alto consumo de CPU no oms-tracking', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-133', 'OMSv3 - OracleDB - Baixa memória no oms-carteira', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-134', 'OMSv3 - OracleDB - Baixa memória no oms-order', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-135', 'OMSv3 - OracleDB - Baixa memória no oms-tracking', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-136', 'OMSv3 - OracleDB - Conexões acima de 1500 no oms-tracking', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-137', 'OMSv3 - OracleDB - Deadlocks acima de 1', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-138', 'OMSv3 - OracleDB - Lock de Transações acima de 20 min', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-139', 'OMSv3 - RDS - Alto uso de CPU oms-order', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-140', 'OMSv3 - RDS - Conexões acima de 1500 no oms-carteira', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-141', 'OMSv3 - RDS oms-order - Connections > 2000', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-142', 'OMSv3 - Redis - Alto consumo de memória', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-143', 'OMSv3 - Redis - Baixa memória disponível', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-144', 'OMSv3 - Redis - Conexões abaixo de 3', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-145', 'OMSv3 - Redis - Evictions acima de 0', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-146', 'OMSv3 - Redis - Replication Lag acima de 5s', ['TORRE_SOLUCOES_LOGISTICAS', 'INFRAESTRUTURA_DATA_CENTER']);

// === OTIMIZA (1) ===
add('P1-147', 'Otimiza - MongoDB - Conexões acima de 1350', ['TORRE_SOLUCOES_DE_LOJAS', 'INFRAESTRUTURA_DATA_CENTER']);

// === RDS GENÉRICO (8) ===
add('P1-150', 'RDS - dblaboracessoprd - Alto consumo de CPU', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-151', 'RDS - dblaboracessoprd - Baixa memória disponível', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-152', 'RDS - dblaboracessoprd - Conexões acima de 100', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-153', 'RDS - dbpreloadingprd - Alto consumo de CPU', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-154', 'RDS - dbpreloadingprd - Baixa memória disponível', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-155', 'RDS - dbrsyprd - Alto consumo de CPU', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-156', 'RDS - dbveltiprd - Alto consumo de CPU', ['DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-157', 'RDS - keycloak-db - Baixa memória disponível', ['DEVOPS_CLOUD']);

// === SUMMIT (1) ===
add('P1-158', 'Summit - MongoDB - Conexões acima de 1350', ['INTEGRACOES__CPI_ODI_OGG_', 'INFRAESTRUTURA_DATA_CENTER']);

// === SYNCROS (15) ===
add('P1-160', 'Syncros - API - Alto número de erros nos logs', ['TORRE_SOLUCOES_COM_E_MARKETING']);
add('P1-161', 'Syncros - RDS - Alto consumo de CPU', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-162', 'Syncros - RDS - Alto consumo de CPU no dpsp-pricing', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-163', 'Syncros - RDS - Baixa memória disponível', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-164', 'Syncros - RDS - Conexões acima de 5000', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-165', 'Syncros - Redis - Alto consumo de memória', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-166', 'Syncros - Redis - Baixa memória disponível', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-167', 'Syncros - Redis - Conexões abaixo de 5', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-168', 'Syncros - Redis - Evictions acima de 0', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-169', 'Syncros - Redis - Replication Lag acima de 5s', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-170', 'Syncros - Redis-v2 - Alto consumo de memória', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-171', 'Syncros - Redis-v2 - Baixa memória disponível', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-172', 'Syncros - Redis-v2 - Conexões abaixo de 10', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-173', 'Syncros - Redis-v2 - Evictions acima de 0', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);
add('P1-174', 'Syncros - Redis-v2 - Replication Lag acima de 5s', ['TORRE_SOLUCOES_COM_E_MARKETING', 'INFRAESTRUTURA_DATA_CENTER']);

// === VTEX (1) ===
add('P1-175', 'VTEX - API - Erro de integração com a App acima de 50', ['TORRE_SOLUCOES_DIGITAIS']);

console.log(`✅ ${count} alertas P1 cadastrados.`);
const totalAreas = db.prepare('SELECT COUNT(*) as c FROM problema_areas').get();
console.log(`   ${totalAreas.c} vínculos de área.`);
db.close();
