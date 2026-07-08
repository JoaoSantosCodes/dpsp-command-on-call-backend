// Import monitor-area mappings from "Alertas Consolidados DataDog 1.xlsx"
// Maps each alert to its corresponding area based on the "Squad/Time indicado" column
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'command-center.db');
const XLSX_PATH = path.join(__dirname, '..', 'Alertas Consolidados DataDog 1.xlsx');

const db = new Database(DB_PATH);

// Read the Excel
const workbook = XLSX.readFile(XLSX_PATH);
const mainSheet = workbook.Sheets['Consolidado Alertas P1'];
const data = XLSX.utils.sheet_to_json(mainSheet);

console.log(`Lido: ${data.length} alertas do Consolidado\n`);

// Map squad names to area codes
const SQUAD_TO_AREA = {
  'cloud': 'DEVOPS_CLOUD',
  'devops': 'DEVOPS_CLOUD',
  'kubernetes': 'DEVOPS_CLOUD',
  'infra': 'INFRAESTRUTURA_DATA_CENTER',
  'infraestrutura': 'INFRAESTRUTURA_DATA_CENTER',
  'data center': 'INFRAESTRUTURA_DATA_CENTER',
  'redes': 'REDES',
  'rede': 'REDES',
  'network': 'REDES',
  'segurança': 'SEGURANCA_DA_INFORMACAO',
  'seguranca': 'SEGURANCA_DA_INFORMACAO',
  'corporativ': 'SOLUCOES_CORPORATIVAS',
  'logístic': 'TORRE_SOLUCOES_LOGISTICAS',
  'logistic': 'TORRE_SOLUCOES_LOGISTICAS',
  'loja': 'TORRE_SOLUCOES_DE_LOJAS',
  'saúde': 'TORRE_SOLUCOES_DE_SAUDE',
  'saude': 'TORRE_SOLUCOES_DE_SAUDE',
  'digital': 'TORRE_SOLUCOES_DIGITAIS',
  'marketing': 'TORRE_SOLUCOES_COM_E_MARKETING',
  'comercia': 'TORRE_SOLUCOES_COM_E_MARKETING',
  'pdv': 'PDV',
  'balcão': 'BALCAO',
  'balcao': 'BALCAO',
  'integra': 'INTEGRACOES__CPI_ODI_OGG_',
  'custom': 'INTEGRACOES__CPI_ODI_OGG_',
  'bde': 'BDE_ODI___MALHA_DE_PRECOS',
  'odi': 'BDE_ODI___MALHA_DE_PRECOS',
  'command': 'COMMAND_CENTER',
};

function mapSquadToArea(squad) {
  if (!squad) return null;
  const lower = squad.toLowerCase();
  for (const [key, area] of Object.entries(SQUAD_TO_AREA)) {
    if (lower.includes(key)) return area;
  }
  return null;
}

// Create monitor_area_mappings table if not exists
db.exec(`
  CREATE TABLE IF NOT EXISTS monitor_area_mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    monitor_id INTEGER NOT NULL,
    monitor_name TEXT NOT NULL,
    area_codigo TEXT NOT NULL,
    priority TEXT DEFAULT 'P1',
    tags TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(monitor_name, area_codigo)
  )
`);

// Parse and insert
const insert = db.prepare(`
  INSERT OR IGNORE INTO monitor_area_mappings (monitor_id, monitor_name, area_codigo, priority, tags)
  VALUES (?, ?, ?, ?, ?)
`);

let mapped = 0;
let unmapped = 0;
const unmappedSquads = new Set();

const insertAll = db.transaction(() => {
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const nome = row['Nome do alerta'] || '';
    const prioridade = row['Prioridade'] || 'P1';
    const tags = row['Tags identificadas'] || '';
    const squad = row['Squad/Time indicado'] || '';

    if (!nome) continue;

    // Try to map by squad column
    const areaCodigo = mapSquadToArea(squad);
    
    if (areaCodigo) {
      // Use a fake monitor_id based on index (real IDs come from Datadog)
      insert.run(1000 + i, nome, areaCodigo, prioridade, tags);
      mapped++;
    } else {
      unmapped++;
      if (squad) unmappedSquads.add(squad);
    }
  }
});
insertAll();

// Also parse individual sheets for more granular mappings
const sheetAreaMap = {
  'Cloud': 'DEVOPS_CLOUD',
  'Balcão 2.0': 'BALCAO',
  'Brigada de Validade': 'SOLUCOES_CORPORATIVAS',
  'Custom - Integrações': 'INTEGRACOES__CPI_ODI_OGG_',
  'Farmácia Popular': 'SOLUCOES_CORPORATIVAS',
  'GDB': 'SOLUCOES_CORPORATIVAS',
  'GLPI': 'INFRAESTRUTURA_DATA_CENTER',
  'Innovare': 'SOLUCOES_CORPORATIVAS',
  'Kong': 'DEVOPS_CLOUD',
  'LMP': 'SOLUCOES_CORPORATIVAS',
  'N8N': 'INTEGRACOES__CPI_ODI_OGG_',
  'OMSv3': 'SOLUCOES_CORPORATIVAS',
  'RDS': 'DEVOPS_CLOUD',
  'Syncros': 'SOLUCOES_CORPORATIVAS',
  'APP Mobile': 'TORRE_SOLUCOES_DIGITAIS',
  'Alertas Acomp+': 'SOLUCOES_CORPORATIVAS',
};

let sheetMapped = 0;
const insertSheet = db.transaction(() => {
  for (const [sheetName, areaCodigo] of Object.entries(sheetAreaMap)) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json(sheet);
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const nome = row['Nome do alerta'] || '';
      const prioridade = row['Prioridade'] || 'P1';
      const tags = row['Tags identificadas'] || '';
      if (!nome) continue;
      insert.run(2000 + sheetMapped, nome, areaCodigo, prioridade, tags);
      sheetMapped++;
    }
  }
});
insertSheet();

// Summary
const total = db.prepare('SELECT COUNT(*) as c FROM monitor_area_mappings').get();

console.log('=== RESULTADO ===');
console.log(`Mapeados do Consolidado: ${mapped}`);
console.log(`Mapeados das abas: ${sheetMapped}`);
console.log(`Não mapeados: ${unmapped}`);
console.log(`Total no banco: ${total.c}`);

if (unmappedSquads.size > 0) {
  console.log('\nSquads não mapeados:');
  for (const s of unmappedSquads) {
    console.log(`  - "${s}"`);
  }
}

// Show sample mappings
console.log('\nAmostra de mapeamentos:');
const sample = db.prepare('SELECT monitor_name, area_codigo, priority FROM monitor_area_mappings LIMIT 10').all();
for (const s of sample) {
  console.log(`  [${s.priority}] ${s.monitor_name.substring(0, 60)} → ${s.area_codigo}`);
}

db.close();
console.log('\n✓ Mapeamento de alertas importado com sucesso!');
