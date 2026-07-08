// Merge sub-areas that belong to the same team into their parent
const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'command-center.db'));
db.pragma('foreign_keys = OFF');

// Areas to merge: child -> parent (same team, same people)
const MERGES = {
  // Soluções Digitais - mesmo time (Moyses/Renata)
  'APP_MOBILE': 'TORRE_SOLUCOES_DIGITAIS',
  'ECOMMERCE_VTEX': 'TORRE_SOLUCOES_DIGITAIS',
  'MARKETPLACE': 'TORRE_SOLUCOES_DIGITAIS',

  // Soluções Comerciais e MKT - mesmo time (Priscila)
  'PRICING_SYNCROS': 'TORRE_SOLUCOES_COM_E_MARKETING',
  'CRM_FIDELIDADE': 'TORRE_SOLUCOES_COM_E_MARKETING',

  // Soluções Corporativas - mesmo time (Marcelo/William)
  'GDB': 'SOLUCOES_CORPORATIVAS',
  'OMSV3': 'SOLUCOES_CORPORATIVAS',
  'LMP': 'SOLUCOES_CORPORATIVAS',
  'INNOVARE': 'SOLUCOES_CORPORATIVAS',
  'SAP_FINANCEIRO': 'SOLUCOES_CORPORATIVAS',

  // Soluções Lojas - mesmo time (Yuri/William)
  'ACOMPMAIS': 'ATENDIMENTO_LOJAS',
  'BRIGADA_VALIDADE': 'ATENDIMENTO_LOJAS',

  // Soluções de Saúde - mesmo time (Victor/William)
  'FARMACIA_POPULAR': 'GDB_SAUDE',

  // Logística - mesmos gerentes (Fabricio)
  'LOGISTICA_SAP': 'LOGISTICA_WMS',

  // Integrações
  'N8N': 'INTEGRACOES',
};

for (const [child, parent] of Object.entries(MERGES)) {
  // Check if child exists
  const exists = db.prepare('SELECT codigo FROM areas WHERE codigo = ?').get(child);
  if (!exists) { console.log(`  SKIP ${child} (não existe)`); continue; }

  // Delete duplicate links (where problema already has parent)
  db.prepare(`
    DELETE FROM problema_areas 
    WHERE area_codigo = ? 
    AND problema_id IN (SELECT problema_id FROM problema_areas WHERE area_codigo = ?)
  `).run(child, parent);

  // Move remaining to parent
  db.prepare('UPDATE problema_areas SET area_codigo = ? WHERE area_codigo = ?').run(parent, child);
  db.prepare('UPDATE monitors SET area_codigo = ? WHERE area_codigo = ?').run(parent, child);
  db.prepare('UPDATE users SET area_codigo = ? WHERE area_codigo = ?').run(parent, child);
  db.prepare('DELETE FROM areas WHERE codigo = ?').run(child);
  console.log(`  ${child} → ${parent}`);
}

// Rename remaining to cleaner names
const renames = [
  ['ATENDIMENTO_LOJAS', 'Soluções Lojas'],
  ['LOGISTICA_WMS', 'Soluções Logísticas'],
  ['GDB_SAUDE', 'Soluções de Saúde'],
  ['TORRE_SOLUCOES_DIGITAIS', 'Soluções Digitais'],
  ['TORRE_SOLUCOES_COM_E_MARKETING', 'Soluções Comerciais e MKT'],
  ['SOLUCOES_CORPORATIVAS', 'Soluções Corporativas'],
];
for (const [codigo, nome] of renames) {
  db.prepare('UPDATE areas SET nome = ? WHERE codigo = ?').run(nome, codigo);
}

// Remove orphan torre-level areas that now have no alerts
const orphans = ['TORRE_SOLUCOES_LOGISTICAS', 'TORRE_SOLUCOES_DE_LOJAS', 'TORRE_SOLUCOES_DE_SAUDE'];
for (const o of orphans) {
  const hasProblems = db.prepare('SELECT COUNT(*) as c FROM problema_areas WHERE area_codigo = ?').get(o);
  if (hasProblems.c === 0) {
    db.prepare('DELETE FROM areas WHERE codigo = ?').run(o);
    console.log(`  Removed orphan: ${o}`);
  }
}

const total = db.prepare('SELECT COUNT(*) as c FROM areas').get();
console.log(`\n✓ Areas finais: ${total.c}`);

// Show final structure
console.log('\nEstrutura final:');
const areas = db.prepare('SELECT codigo, nome, torre, coordenador_nome FROM areas WHERE codigo != ? ORDER BY nome', ).all('PENDENTE_APROVACAO');
for (const a of areas) {
  console.log(`  ${a.nome} [${a.codigo}] - Coord: ${a.coordenador_nome || '-'}`);
}

db.close();
