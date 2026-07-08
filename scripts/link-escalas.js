// Link all sub-department alerts to their parent department for escalation
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'command-center.db'));

// Map child departments to parent (where escalas exist)
const CHILD_TO_PARENT = {
  'KONG_API_GATEWAY': 'DEVOPS_CLOUD',
  'GLPI': 'INFRAESTRUTURA_DATA_CENTER',
  'N8N': 'INTEGRACOES',
  'INNOVARE': 'SAP_FINANCEIRO',
  'ACOMPMAIS': 'ATENDIMENTO_LOJAS',
  'BRIGADA_VALIDADE': 'ATENDIMENTO_LOJAS',
  'OMSV3': 'SAP_FINANCEIRO',
  'GDB': 'SAP_FINANCEIRO',
  'LMP': 'SAP_FINANCEIRO',
  'FARMACIA_POPULAR': 'GDB_SAUDE',
  'GDB_SAUDE': 'FARMACIA_POPULAR',
  'PRICING_SYNCROS': 'CRM_FIDELIDADE',
  'APP_MOBILE': 'ECOMMERCE_VTEX',
  'ECOMMERCE_VTEX': 'APP_MOBILE',
  'MARKETPLACE': 'ECOMMERCE_VTEX',
};

const insert = db.prepare('INSERT OR IGNORE INTO problema_areas (problema_id, area_codigo, ordem, created_at) VALUES (?, ?, ?, datetime(\'now\'))');

let linked = 0;
for (const [child, parent] of Object.entries(CHILD_TO_PARENT)) {
  const problems = db.prepare('SELECT problema_id FROM problema_areas WHERE area_codigo = ?').all(child);
  for (const p of problems) {
    // Add parent as secondary area (ordem 2)
    const existing = db.prepare('SELECT id FROM problema_areas WHERE problema_id = ? AND area_codigo = ?').get(p.problema_id, parent);
    if (!existing) {
      insert.run(p.problema_id, parent, 2);
      linked++;
    }
  }
}

// Also link ALL alerts to DEVOPS_CLOUD as infra support (ordem 3) for Cloud/RDS related
const cloudAlerts = db.prepare("SELECT pa.problema_id FROM problema_areas pa JOIN problemas p ON p.id = pa.problema_id WHERE p.descricao LIKE '%RDS%' OR p.descricao LIKE '%Kubernetes%' OR p.descricao LIKE '%Cloud%'").all();
for (const p of cloudAlerts) {
  const existing = db.prepare('SELECT id FROM problema_areas WHERE problema_id = ? AND area_codigo = ?').get(p.problema_id, 'DEVOPS_CLOUD');
  if (!existing) {
    insert.run(p.problema_id, 'DEVOPS_CLOUD', 3);
    linked++;
  }
}

console.log(`✓ ${linked} vínculos de escalonamento adicionados`);
db.close();
