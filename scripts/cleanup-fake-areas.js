const Database = require('better-sqlite3');
const path = require('path');
const db = new Database(path.join(__dirname, '..', 'data', 'command-center.db'));
db.pragma('foreign_keys = OFF');

const areas = db.prepare('SELECT id, codigo, nome FROM areas').all();
let removed = 0;

// Valid area names contain these keywords
const validAreas = new Set([
  'DEVOPS_CLOUD', 'INFRAESTRUTURA_DATA_CENTER', 'REDES', 'SEGURANCA_DA_INFORMACAO',
  'INTEGRACOES__CPI_ODI_OGG_', 'COMMAND_CENTER', 'PDV', 'BALCAO',
  'TORRE_SOLUCOES_DIGITAIS', 'TORRE_SOLUCOES_COM_E_MARKETING',
  'SOLUCOES_CORPORATIVAS', 'LOGISTICA_WMS', 'ATENDIMENTO_LOJAS',
  'GDB_SAUDE', 'BDE_ODI___MALHA_DE_PRECOS', 'PENDENTE_APROVACAO',
]);

for (const a of areas) {
  if (!validAreas.has(a.codigo)) {
    db.prepare('DELETE FROM problema_areas WHERE area_codigo = ?').run(a.codigo);
    db.prepare('DELETE FROM escalas WHERE area_codigo = ?').run(a.codigo);
    db.prepare('DELETE FROM periodos WHERE area_codigo = ?').run(a.codigo);
    db.prepare('DELETE FROM monitors WHERE area_codigo = ?').run(a.codigo);
    db.prepare('DELETE FROM users WHERE area_codigo = ?').run(a.codigo);
    db.prepare('DELETE FROM areas WHERE id = ?').run(a.id);
    removed++;
    console.log('  Removed:', a.nome);
  }
}

db.pragma('foreign_keys = ON');
const remaining = db.prepare('SELECT nome FROM areas ORDER BY nome').all();
console.log(`\n✓ Removed ${removed} fake areas. Remaining: ${remaining.length}`);
remaining.forEach(a => console.log('  ', a.nome));
db.close();
