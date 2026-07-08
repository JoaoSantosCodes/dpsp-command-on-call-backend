// Seed monitors from "Alertas Consolidados DataDog 1.xlsx" as mock data
// So the dashboard shows alerts even without Datadog API connection
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'command-center.db');
const XLSX_PATH = path.join(__dirname, '..', 'Alertas Consolidados DataDog 1.xlsx');

const db = new Database(DB_PATH);
const workbook = XLSX.readFile(XLSX_PATH);
const sheet = workbook.Sheets['Consolidado Alertas P1'];
const data = XLSX.utils.sheet_to_json(sheet);

// Create monitors table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS monitors (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    state TEXT DEFAULT 'OK',
    tags TEXT,
    priority TEXT DEFAULT 'P1',
    area_codigo TEXT,
    last_updated TEXT DEFAULT (datetime('now'))
  )
`);

// Map squad to area
const SQUAD_TO_AREA = {
  'cloud': 'DEVOPS_CLOUD',
  'devops': 'DEVOPS_CLOUD',
  'kubernetes': 'DEVOPS_CLOUD',
  'infra': 'INFRAESTRUTURA_DATA_CENTER',
  'infraestrutura': 'INFRAESTRUTURA_DATA_CENTER',
  'data center': 'INFRAESTRUTURA_DATA_CENTER',
  'banco de dados': 'INFRAESTRUTURA_DATA_CENTER',
  'redes': 'REDES',
  'rede': 'REDES',
  'network': 'REDES',
  'direct connect': 'REDES',
  'segurança': 'SEGURANCA_DA_INFORMACAO',
  'seguranca': 'SEGURANCA_DA_INFORMACAO',
  'corporativ': 'SOLUCOES_CORPORATIVAS',
  'logístic': 'TORRE_SOLUCOES_LOGISTICAS',
  'logistic': 'TORRE_SOLUCOES_LOGISTICAS',
  'loja': 'TORRE_SOLUCOES_DE_LOJAS',
  'saúde': 'TORRE_SOLUCOES_DE_SAUDE',
  'saude': 'TORRE_SOLUCOES_DE_SAUDE',
  'digital': 'TORRE_SOLUCOES_DIGITAIS',
  'app mobile': 'TORRE_SOLUCOES_DIGITAIS',
  'marketing': 'TORRE_SOLUCOES_COM_E_MARKETING',
  'comercia': 'TORRE_SOLUCOES_COM_E_MARKETING',
  'pdv': 'PDV',
  'balcão': 'BALCAO',
  'balcao': 'BALCAO',
  'integra': 'INTEGRACOES__CPI_ODI_OGG_',
  'custom': 'INTEGRACOES__CPI_ODI_OGG_',
  'n8n': 'INTEGRACOES__CPI_ODI_OGG_',
  'bde': 'BDE_ODI___MALHA_DE_PRECOS',
  'malha': 'BDE_ODI___MALHA_DE_PRECOS',
  'command': 'COMMAND_CENTER',
  'syncros': 'SOLUCOES_CORPORATIVAS',
  'omsv3': 'SOLUCOES_CORPORATIVAS',
  'oms': 'SOLUCOES_CORPORATIVAS',
  'gdb': 'SOLUCOES_CORPORATIVAS',
  'lmp': 'SOLUCOES_CORPORATIVAS',
  'glpi': 'INFRAESTRUTURA_DATA_CENTER',
  'innovare': 'SOLUCOES_CORPORATIVAS',
  'farmácia': 'SOLUCOES_CORPORATIVAS',
  'farmacia': 'SOLUCOES_CORPORATIVAS',
  'kong': 'DEVOPS_CLOUD',
  'rds': 'DEVOPS_CLOUD',
  'acompmais': 'SOLUCOES_CORPORATIVAS',
  'acomp': 'SOLUCOES_CORPORATIVAS',
  'brigada': 'SOLUCOES_CORPORATIVAS',
  'vtex': 'TORRE_SOLUCOES_DIGITAIS',
};

function mapToArea(squad, alertName) {
  const combined = ((squad || '') + ' ' + (alertName || '')).toLowerCase();
  for (const [key, area] of Object.entries(SQUAD_TO_AREA)) {
    if (combined.includes(key)) return area;
  }
  return 'COMMAND_CENTER';
}

// Simulate some alerts in different states
const states = ['OK', 'OK', 'OK', 'OK', 'OK', 'OK', 'Alert', 'Alert', 'Warn', 'OK'];

console.log('Inserindo monitores mock...');
db.prepare('DELETE FROM monitors').run();

const insert = db.prepare(`
  INSERT INTO monitors (id, name, state, tags, priority, area_codigo, last_updated)
  VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
`);

const insertAll = db.transaction(() => {
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const name = row['Nome do alerta'] || '';
    const tags = row['Tags identificadas'] || '';
    const squad = row['Squad/Time indicado'] || '';
    const priority = row['Prioridade'] || 'P1';
    if (!name) continue;

    const area = mapToArea(squad, name);
    const state = states[i % states.length];
    
    insert.run(1000 + i, name, state, tags, priority, area);
  }
});
insertAll();

const total = db.prepare('SELECT COUNT(*) as c FROM monitors').get();
const alerting = db.prepare("SELECT COUNT(*) as c FROM monitors WHERE state = 'Alert'").get();
const warning = db.prepare("SELECT COUNT(*) as c FROM monitors WHERE state = 'Warn'").get();

console.log(`\n✓ ${total.c} monitores inseridos`);
console.log(`  - ${alerting.c} em Alert`);
console.log(`  - ${warning.c} em Warn`);
console.log(`  - ${total.c - alerting.c - warning.c} em OK`);

// Show by area
console.log('\nPor área:');
const byArea = db.prepare("SELECT area_codigo, COUNT(*) as c, SUM(CASE WHEN state='Alert' THEN 1 ELSE 0 END) as alerts FROM monitors GROUP BY area_codigo ORDER BY c DESC").all();
for (const a of byArea) {
  console.log(`  ${a.area_codigo}: ${a.c} monitores (${a.alerts} alerting)`);
}

db.close();
