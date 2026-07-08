// Seed problemas (alerts mapped to areas) from the Alertas Excel
const XLSX = require('xlsx');
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'command-center.db');
const XLSX_PATH = path.join(__dirname, '..', 'Alertas Consolidados DataDog 1.xlsx');

const db = new Database(DB_PATH);
const workbook = XLSX.readFile(XLSX_PATH);
const sheet = workbook.Sheets['Consolidado Alertas P1'];
const data = XLSX.utils.sheet_to_json(sheet);

const SQUAD_TO_AREA = {
  'cloud': 'DEVOPS_CLOUD', 'devops': 'DEVOPS_CLOUD', 'kubernetes': 'DEVOPS_CLOUD',
  'kong': 'DEVOPS_CLOUD', 'rds': 'DEVOPS_CLOUD',
  'infra': 'INFRAESTRUTURA_DATA_CENTER', 'data center': 'INFRAESTRUTURA_DATA_CENTER',
  'banco de dados': 'INFRAESTRUTURA_DATA_CENTER', 'glpi': 'INFRAESTRUTURA_DATA_CENTER',
  'redes': 'REDES', 'network': 'REDES', 'direct connect': 'REDES',
  'segurança': 'SEGURANCA_DA_INFORMACAO', 'seguranca': 'SEGURANCA_DA_INFORMACAO',
  'corporativ': 'SOLUCOES_CORPORATIVAS', 'syncros': 'SOLUCOES_CORPORATIVAS',
  'omsv3': 'SOLUCOES_CORPORATIVAS', 'oms': 'SOLUCOES_CORPORATIVAS',
  'gdb': 'SOLUCOES_CORPORATIVAS', 'lmp': 'SOLUCOES_CORPORATIVAS',
  'innovare': 'SOLUCOES_CORPORATIVAS', 'farmácia': 'SOLUCOES_CORPORATIVAS',
  'farmacia': 'SOLUCOES_CORPORATIVAS', 'acompmais': 'SOLUCOES_CORPORATIVAS',
  'acomp': 'SOLUCOES_CORPORATIVAS', 'brigada': 'SOLUCOES_CORPORATIVAS',
  'logístic': 'TORRE_SOLUCOES_LOGISTICAS', 'logistic': 'TORRE_SOLUCOES_LOGISTICAS',
  'loja': 'TORRE_SOLUCOES_DE_LOJAS',
  'saúde': 'TORRE_SOLUCOES_DE_SAUDE', 'saude': 'TORRE_SOLUCOES_DE_SAUDE',
  'digital': 'TORRE_SOLUCOES_DIGITAIS', 'app mobile': 'TORRE_SOLUCOES_DIGITAIS',
  'vtex': 'TORRE_SOLUCOES_DIGITAIS',
  'marketing': 'TORRE_SOLUCOES_COM_E_MARKETING', 'comercia': 'TORRE_SOLUCOES_COM_E_MARKETING',
  'pdv': 'PDV', 'suporte pdv': 'PDV',
  'balcão': 'BALCAO', 'balcao': 'BALCAO',
  'integra': 'INTEGRACOES__CPI_ODI_OGG_', 'custom': 'INTEGRACOES__CPI_ODI_OGG_',
  'n8n': 'INTEGRACOES__CPI_ODI_OGG_',
  'bde': 'BDE_ODI___MALHA_DE_PRECOS', 'malha': 'BDE_ODI___MALHA_DE_PRECOS',
};

function getAreas(squad, alertName) {
  const combined = ((squad || '') + ' ' + (alertName || '')).toLowerCase();
  const matched = new Set();
  for (const [key, area] of Object.entries(SQUAD_TO_AREA)) {
    if (combined.includes(key)) matched.add(area);
  }
  return matched.size > 0 ? [...matched] : ['COMMAND_CENTER'];
}

// Clear existing
db.prepare('DELETE FROM problema_areas').run();
db.prepare('DELETE FROM problemas').run();

const insertProblema = db.prepare(`
  INSERT INTO problemas (codigo, descricao, created_at, updated_at)
  VALUES (?, ?, datetime('now'), datetime('now'))
`);
const insertArea = db.prepare(`
  INSERT INTO problema_areas (problema_id, area_codigo, ordem, created_at)
  VALUES (?, ?, ?, datetime('now'))
`);

let count = 0;
const insertAll = db.transaction(() => {
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const name = row['Nome do alerta'] || '';
    const squad = row['Squad/Time indicado'] || '';
    if (!name) continue;

    const codigo = `ALRT-${String(i + 1).padStart(3, '0')}`;
    const result = insertProblema.run(codigo, name);
    const problemaId = Number(result.lastInsertRowid);

    const areas = getAreas(squad, name);
    areas.forEach((area, idx) => {
      insertArea.run(problemaId, area, idx + 1);
    });
    count++;
  }
});
insertAll();

const total = db.prepare('SELECT COUNT(*) as c FROM problemas').get();
const totalAreas = db.prepare('SELECT COUNT(*) as c FROM problema_areas').get();

console.log(`✓ ${total.c} problemas criados com ${totalAreas.c} vínculos de área`);
console.log(`\nAmostra:`);
const sample = db.prepare(`
  SELECT p.codigo, p.descricao, GROUP_CONCAT(pa.area_codigo) as areas
  FROM problemas p JOIN problema_areas pa ON pa.problema_id = p.id
  GROUP BY p.id LIMIT 5
`).all();
for (const s of sample) {
  console.log(`  [${s.codigo}] ${s.descricao.substring(0, 50)} → ${s.areas}`);
}

db.close();
