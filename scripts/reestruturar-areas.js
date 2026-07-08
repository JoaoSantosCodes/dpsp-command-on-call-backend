// Reestruturar áreas: Torres viram departamentos/setores específicos
// Baseado na documentação de estrutura de torres
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'command-center.db');
const db = new Database(DB_PATH);

// Nova estrutura: departamentos/setores (não mais torres genéricas)
const DEPARTAMENTOS = [
  // Soluções Lojas - desmembrado em setores
  { codigo: 'ATENDIMENTO_LOJAS', nome: 'Atendimento Lojas', torre: 'Soluções Lojas', coordNome: 'Yuri Marques', coordContato: '(19) 96444-428', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },
  { codigo: 'BALCAO', nome: 'Balcão', torre: 'Soluções Lojas', coordNome: 'Yuri Marques', coordContato: '(19) 96444-428', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },
  { codigo: 'PDV', nome: 'PDV', torre: 'Soluções Lojas', coordNome: 'Yuri Marques', coordContato: '(19) 96444-428', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },

  // Soluções Digitais - desmembrado
  { codigo: 'APP_MOBILE', nome: 'APP Mobile', torre: 'Soluções Digitais', coordNome: 'Moyses Santos', coordContato: '(11) 94535-4913', gerenteNome: 'Renata Silva', gerenteContato: null },
  { codigo: 'ECOMMERCE_VTEX', nome: 'E-commerce / VTEX', torre: 'Soluções Digitais', coordNome: 'Moyses Santos', coordContato: '(11) 94535-4913', gerenteNome: 'Renata Silva', gerenteContato: null },
  { codigo: 'MARKETPLACE', nome: 'Marketplace', torre: 'Soluções Digitais', coordNome: 'Moyses Santos', coordContato: '(11) 94535-4913', gerenteNome: 'Renata Silva', gerenteContato: null },

  // Soluções Logísticas - desmembrado
  { codigo: 'LOGISTICA_WMS', nome: 'Logística WMS', torre: 'Soluções Logísticas', coordNome: 'Robson Rogerio dos Santos', coordContato: '(11) 98177-7837', gerenteNome: 'Fabricio Spano', gerenteContato: '(11) 97208-7822' },
  { codigo: 'LOGISTICA_SAP', nome: 'Logística SAP', torre: 'Soluções Logísticas', coordNome: 'Alessandro Lucas Soares', coordContato: '(11) 97208-7822', gerenteNome: 'Fabricio Spano', gerenteContato: '(11) 97208-7822' },

  // Comercial e MKT - desmembrado
  { codigo: 'PRICING_SYNCROS', nome: 'Pricing / Syncros', torre: 'Soluções Comerciais e MKT', coordNome: 'Priscila Lira Alves', coordContato: '(11) 97355-7180', gerenteNome: null, gerenteContato: null },
  { codigo: 'CRM_FIDELIDADE', nome: 'CRM & Fidelidade', torre: 'Soluções Comerciais e MKT', coordNome: 'Priscila Lira Alves', coordContato: '(11) 97355-7180', gerenteNome: null, gerenteContato: null },

  // Corporativas - desmembrado
  { codigo: 'SAP_FINANCEIRO', nome: 'SAP Financeiro', torre: 'Soluções Corporativas', coordNome: 'Marcelo Almeida', coordContato: '(11) 94546-0472', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },
  { codigo: 'OMSV3', nome: 'OMSv3', torre: 'Soluções Corporativas', coordNome: 'Marcelo Almeida', coordContato: '(11) 94546-0472', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },
  { codigo: 'GDB', nome: 'GDB', torre: 'Soluções Corporativas', coordNome: 'Marcelo Almeida', coordContato: '(11) 94546-0472', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },
  { codigo: 'LMP', nome: 'LMP', torre: 'Soluções Corporativas', coordNome: 'Thiago Moreira', coordContato: '(11) 94562-7211', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },

  // Saúde - desmembrado
  { codigo: 'FARMACIA_POPULAR', nome: 'Farmácia Popular', torre: 'Soluções de Saúde', coordNome: 'Victor Hideo Nagatani', coordContato: '(11) 91033-0161', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },
  { codigo: 'GDB_SAUDE', nome: 'GDB Saúde', torre: 'Soluções de Saúde', coordNome: 'Victor Hideo Nagatani', coordContato: '(11) 91033-0161', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },

  // Infra/Serviços horizontais (mantém)
  { codigo: 'DEVOPS_CLOUD', nome: 'DevOps / Cloud', torre: 'DevOps / Cloud', coordNome: 'Jair Meira Nascimento', coordContato: '(11) 99741-1892', gerenteNome: 'Alex Almeida', gerenteContato: '(11) 99693-6308' },
  { codigo: 'INFRAESTRUTURA_DATA_CENTER', nome: 'Infraestrutura Data Center', torre: 'Infraestrutura', coordNome: 'Andrie Ferreira Bittencourt', coordContato: '(11) 96392-0260', gerenteNome: 'Alex Almeida', gerenteContato: '(11) 99693-6308' },
  { codigo: 'REDES', nome: 'Redes', torre: 'Redes', coordNome: 'Mauricio Santos Pomponet', coordContato: '(11) 94195-7625', gerenteNome: 'Marcos Marra Boldori', gerenteContato: '(11) 93259-6134' },
  { codigo: 'SEGURANCA_DA_INFORMACAO', nome: 'Segurança da Informação', torre: 'Segurança da Informação', coordNome: 'Silvio Antonio Martins Traldi', coordContato: '(11) 94455-6854', gerenteNome: 'Sergio Castanho', gerenteContato: '(11) 96413-1405' },
  { codigo: 'INTEGRACOES', nome: 'Integrações (CPI/ODI/OGG)', torre: 'Integrações', coordNome: 'Tarciso Franzote Perozini', coordContato: null, gerenteNome: null, gerenteContato: null },
  { codigo: 'COMMAND_CENTER', nome: 'Command Center', torre: 'Command Center', coordNome: 'Diego Carmo', coordContato: '(11) 94333-4500', gerenteNome: 'Alexandre Carvalho de Lima', gerenteContato: '(11) 98965-2816' },
  { codigo: 'BDE_MALHA_PRECOS', nome: 'BDE/ODI - Malha de Preços', torre: 'BDE/ODI', coordNome: null, coordContato: null, gerenteNome: null, gerenteContato: null },

  // Aplicações específicas que aparecem como alertas
  { codigo: 'GLPI', nome: 'GLPI / ITSM', torre: 'Infraestrutura', coordNome: 'Andrie Ferreira Bittencourt', coordContato: '(11) 96392-0260', gerenteNome: 'Alex Almeida', gerenteContato: '(11) 99693-6308' },
  { codigo: 'KONG_API_GATEWAY', nome: 'Kong / API Gateway', torre: 'DevOps / Cloud', coordNome: 'Jair Meira Nascimento', coordContato: '(11) 99741-1892', gerenteNome: 'Alex Almeida', gerenteContato: '(11) 99693-6308' },
  { codigo: 'N8N', nome: 'N8N', torre: 'Integrações', coordNome: 'Tarciso Franzote Perozini', coordContato: null, gerenteNome: null, gerenteContato: null },
  { codigo: 'INNOVARE', nome: 'Innovare', torre: 'Soluções Corporativas', coordNome: 'Marcelo Almeida', coordContato: '(11) 94546-0472', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },
  { codigo: 'ACOMPMAIS', nome: 'AcompMais', torre: 'Soluções Lojas', coordNome: 'Yuri Marques', coordContato: '(19) 96444-428', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },
  { codigo: 'BRIGADA_VALIDADE', nome: 'Brigada de Validade', torre: 'Soluções Lojas', coordNome: 'Yuri Marques', coordContato: '(19) 96444-428', gerenteNome: 'William Mendonça', gerenteContato: '(11) 94554-4585' },

  // Pendente
  { codigo: 'PENDENTE_APROVACAO', nome: 'Pendente de Aprovação', torre: null, coordNome: null, coordContato: null, gerenteNome: null, gerenteContato: null },
];

// Clear and recreate areas
console.log('Recriando áreas como departamentos/setores...');
db.pragma('foreign_keys = OFF');
db.prepare('DELETE FROM problema_areas').run();
db.prepare('DELETE FROM problemas').run();
db.prepare('DELETE FROM escalas').run();
db.prepare('DELETE FROM periodos').run();
db.prepare('DELETE FROM user_areas').run();
db.prepare('DELETE FROM users WHERE perfil = ?').run('Plantonista');
db.prepare('DELETE FROM areas').run();
db.pragma('foreign_keys = ON');

const insertArea = db.prepare(`
  INSERT INTO areas (codigo, nome, torre, coordenador_nome, coordenador_contato, gerente_nome, gerente_contato, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
`);

for (const d of DEPARTAMENTOS) {
  insertArea.run(d.codigo, d.nome, d.torre, d.coordNome, d.coordContato, d.gerenteNome, d.gerenteContato);
}

console.log(`✓ ${DEPARTAMENTOS.length} departamentos/setores criados`);

// Now re-map alertas to the specific departments
const XLSX = require('xlsx');
const XLSX_PATH = path.join(__dirname, '..', 'Alertas Consolidados DataDog 1.xlsx');
const workbook = XLSX.readFile(XLSX_PATH);
const sheet = workbook.Sheets['Consolidado Alertas P1'];
const data = XLSX.utils.sheet_to_json(sheet);

// More precise mapping based on alert name keywords
const ALERT_TO_DEPT = {
  'app mobile': 'APP_MOBILE', 'appmob': 'APP_MOBILE',
  'vtex': 'ECOMMERCE_VTEX', 'e-commerce': 'ECOMMERCE_VTEX', 'marketplace': 'MARKETPLACE',
  'balcão': 'BALCAO', 'balcao': 'BALCAO', 'smart balcão': 'BALCAO',
  'pdv': 'PDV',
  'acompmais': 'ACOMPMAIS', 'acomp+': 'ACOMPMAIS', 'acomp mais': 'ACOMPMAIS',
  'brigada': 'BRIGADA_VALIDADE',
  'syncros': 'PRICING_SYNCROS',
  'omsv3': 'OMSV3', 'oms': 'OMSV3',
  'gdb': 'GDB',
  'lmp': 'LMP',
  'innovare': 'INNOVARE',
  'glpi': 'GLPI',
  'kong': 'KONG_API_GATEWAY', 'api gateway': 'KONG_API_GATEWAY',
  'n8n': 'N8N',
  'farmacia': 'FARMACIA_POPULAR', 'farmácia': 'FARMACIA_POPULAR',
  'cloud': 'DEVOPS_CLOUD', 'kubernetes': 'DEVOPS_CLOUD', 'k8s': 'DEVOPS_CLOUD',
  'rds': 'DEVOPS_CLOUD',
  'infra': 'INFRAESTRUTURA_DATA_CENTER', 'data center': 'INFRAESTRUTURA_DATA_CENTER',
  'redes': 'REDES', 'network': 'REDES', 'direct connect': 'REDES',
  'segurança': 'SEGURANCA_DA_INFORMACAO', 'seguranca': 'SEGURANCA_DA_INFORMACAO',
  'custom': 'INTEGRACOES', 'integra': 'INTEGRACOES',
  'bde': 'BDE_MALHA_PRECOS', 'malha': 'BDE_MALHA_PRECOS',
  'wms': 'LOGISTICA_WMS', 'wamas': 'LOGISTICA_WMS',
};

function getDepartamento(alertName, squad) {
  const combined = ((alertName || '') + ' ' + (squad || '')).toLowerCase();
  for (const [key, dept] of Object.entries(ALERT_TO_DEPT)) {
    if (combined.includes(key)) return dept;
  }
  return 'COMMAND_CENTER';
}

// Create problemas with proper department mappings
const insertProblema = db.prepare(`INSERT INTO problemas (codigo, descricao, created_at, updated_at) VALUES (?, ?, datetime('now'), datetime('now'))`);
const insertProblemaArea = db.prepare(`INSERT INTO problema_areas (problema_id, area_codigo, ordem, created_at) VALUES (?, ?, ?, datetime('now'))`);

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

    const dept = getDepartamento(name, squad);
    insertProblemaArea.run(problemaId, dept, 1);

    // If alert mentions banco de dados, also link to infra
    const lower = name.toLowerCase();
    if ((lower.includes('rds') || lower.includes('mongo') || lower.includes('oracle') || lower.includes('redis')) && dept !== 'INFRAESTRUTURA_DATA_CENTER' && dept !== 'DEVOPS_CLOUD') {
      insertProblemaArea.run(problemaId, 'INFRAESTRUTURA_DATA_CENTER', 2);
    }

    count++;
  }
});
insertAll();

// Also update monitors table
db.prepare('DELETE FROM monitors').run();
const insertMonitor = db.prepare(`INSERT INTO monitors (id, name, state, tags, priority, area_codigo, last_updated) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`);
const states = ['OK', 'OK', 'OK', 'OK', 'OK', 'OK', 'Alert', 'Alert', 'Warn', 'OK'];
const insertMon = db.transaction(() => {
  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const name = row['Nome do alerta'] || '';
    const tags = row['Tags identificadas'] || '';
    const squad = row['Squad/Time indicado'] || '';
    if (!name) continue;
    const dept = getDepartamento(name, squad);
    insertMonitor.run(1000 + i, name, states[i % states.length], tags, 'P1', dept);
  }
});
insertMon();

// Summary
const totalProblemas = db.prepare('SELECT COUNT(*) as c FROM problemas').get();
const totalAreas = db.prepare('SELECT COUNT(*) as c FROM areas').get();
const totalMonitors = db.prepare('SELECT COUNT(*) as c FROM monitors').get();

console.log(`\n=== RESULTADO ===`);
console.log(`Departamentos/Setores: ${totalAreas.c}`);
console.log(`Problemas (alertas): ${totalProblemas.c}`);
console.log(`Monitores: ${totalMonitors.c}`);

console.log('\nDistribuição por departamento:');
const dist = db.prepare(`SELECT area_codigo, COUNT(*) as c FROM problema_areas GROUP BY area_codigo ORDER BY c DESC`).all();
for (const d of dist) {
  const area = db.prepare('SELECT nome FROM areas WHERE codigo = ?').get(d.area_codigo);
  console.log(`  ${area ? area.nome : d.area_codigo}: ${d.c} alertas`);
}

db.close();
console.log('\n✓ Reestruturação concluída!');
