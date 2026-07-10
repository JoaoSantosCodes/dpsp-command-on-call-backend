/**
 * Generate the escalation template XLSX.
 * Run: npx tsx templates/generate-template.ts
 */
import XLSX from 'xlsx';
import path from 'path';

function generateTemplate() {
  const wb = XLSX.utils.book_new();

  // === Example sheet: DevOps / Cloud ===
  const exampleData = [
    ['DevOps / Cloud'],
    ['Julho/2026'],
    [],
    ['Colaborador', 'Cargo', 'Contato', 'Nível', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31'],
    ['Claudio Rogerio Ribeiro Lopes', 'Analista DevOps III', '14 99137-1213', '1º Escalão', '18:00-06:00', '', '', '', '', '', '', '18:00-06:00', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '18:00-06:00', '', '', ''],
    ['Vitor Morais Clauz', 'Analista DevOps II', '11 98312-4847', '1º Escalão', '', '18:00-06:00', '', '', '', '', '18:00-06:00', '', '', '', '', '', '', '', '18:00-06:00', '', '08:00-06:00', '', '18:00-06:00', '', '', '', '', '', '18:00-06:00', '', ''],
    ['Vitor Fratucci Francisco', 'Analista DevOps I', '11 99759-6678', '1º Escalão', '', '', '18:00-08:00', '', '', '', '', '', '', '', '08:00-08:00', '', '', '', '', '', '', '', '', '18:00-08:00', '', '', '', '', '', '', '18:00-08:00'],
    ['David Alves de Araujo', 'Analista DevOps III', '21 99834-0406', '1º Escalão', '', '', '', '24hs', '', '', '', '', '', '', '', '', '18:00-06:00', '', '', '', '', '18:00-06:00', '', '', '', '08:00-06:00', '', '', '', '', ''],
    ['Ricardo Fracini', 'Analista DevOps II', '11 96911-6690', '1º Escalão', '', '', '', '', '08:00-06:00', '', '', '', '', '18:00-08:00', '', '', '', '', '', '18:00-06:00', '', '', '', '', '08:00-08:00', '', '', '', '', '', ''],
    ['Yago Castilho', 'Analista DevOps', '11 93444-1518', '1º Escalão', '', '', '', '', '', '18:00-06:00', '', '', '', '', '', '', '', '18:00-06:00', '', '', '', '08:00-08:00', '', '', '', '', '', '', '', '18:00-06:00', ''],
    ['Marcelo Vilela de Morais', 'Analista DevOps I', '11 98273-9488', '1º Escalão', '', '', '', '', '', '', '', '', '08:00-06:00', '', '', '08:00-06:00', '', '', '', '', '', '', '', '', '', '', '18:00-06:00', '', '', '', ''],
    [],
    ['Leandro Silva', 'Especialista', '24 99266-6604', '2º Escalão', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Jair Nascimento', 'Coordenador', '11 99741-1892', '3º Escalão', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['Alex Almeida', 'Gerente', '11 99693-6308', '4º Escalão', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(exampleData);
  ws1['!cols'] = [
    { wch: 32 }, // Colaborador
    { wch: 22 }, // Cargo
    { wch: 16 }, // Contato
    { wch: 12 }, // Nível
    ...Array(31).fill({ wch: 12 }), // Days
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'DevOps - Cloud');

  // === Blank template sheet ===
  const blankData = [
    ['NOME DA ÁREA AQUI'],
    ['Mês/Ano (ex: Agosto/2026)'],
    [],
    ['Colaborador', 'Cargo', 'Contato', 'Nível', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(blankData);
  ws2['!cols'] = [{ wch: 32 }, { wch: 22 }, { wch: 16 }, { wch: 12 }, ...Array(31).fill({ wch: 12 })];
  XLSX.utils.book_append_sheet(wb, ws2, 'Template Vazio');

  // === Instructions ===
  const instrData = [
    ['INSTRUÇÕES DE PREENCHIMENTO — Template de Escalonamento'],
    [],
    ['ESTRUTURA DO ARQUIVO:'],
    ['• Cada aba do Excel = uma área/departamento'],
    ['• O nome da aba identifica a área (ex: "DevOps - Cloud", "PDV", "Redes")'],
    [],
    ['ESTRUTURA DA ABA:'],
    ['• Linha 1: Nome da área (será usado para identificar no sistema)'],
    ['• Linha 2: Mês/Ano de referência (ex: "Julho/2026", "Agosto/2026")'],
    ['• Linha 3: Vazia (separador)'],
    ['• Linha 4: Cabeçalhos — Colaborador | Cargo | Contato | Nível | 01 | 02 | ... | 31'],
    ['• Linhas 5+: Dados dos plantonistas'],
    [],
    ['COLUNAS FIXAS:'],
    ['• Colaborador — Nome completo do plantonista'],
    ['• Cargo — Ex: "Analista DevOps III", "Coordenador"'],
    ['• Contato — Telefone com DDD (ex: "11 98312-4847")'],
    ['• Nível — "1º Escalão", "2º Escalão", "3º Escalão", "4º Escalão" ou "Direto"'],
    [],
    ['COLUNAS DE DIAS (01 a 31):'],
    ['• Preencher com o horário do sobreaviso naquele dia'],
    ['• Formatos aceitos:'],
    ['    - "18:00-06:00" (horário início - horário fim)'],
    ['    - "18:00 às 06:00" (com "às")'],
    ['    - "08:00-08:00" (turno de 24h)'],
    ['    - "24hs" ou "24h" (turno integral)'],
    ['    - "X" ou "S" (marca presença como 24h)'],
    ['    - Vazio = sem plantão nesse dia'],
    [],
    ['REGRAS DE IMPORTAÇÃO:'],
    ['• A importação SUBSTITUI toda a escala do mês para a área'],
    ['• Plantonistas novos são criados automaticamente (senha padrão: plantonista123)'],
    ['• Plantonistas existentes são atualizados (cargo, contato)'],
    ['• Conflitos são detectados (mesmo plantonista em dois turnos sobrepostos)'],
    ['• Níveis 2º, 3º, 4º não precisam ter dias preenchidos (são escalação fixa)'],
    [],
    ['MÚLTIPLAS ÁREAS:'],
    ['• Crie uma aba para cada área no mesmo arquivo'],
    ['• Ou envie arquivos separados por área'],
    [],
    ['DICAS:'],
    ['• Não use proteção por senha no arquivo'],
    ['• Aceita formatos .xlsx e .csv'],
    ['• O sistema valida os dados antes de importar'],
    ['• Veja a aba "DevOps - Cloud" como exemplo preenchido'],
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(instrData);
  ws3['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Instruções');

  const outputPath = path.join(__dirname, 'Template_Escalonamento.xlsx');
  XLSX.writeFile(wb, outputPath);
  console.log('✓ Template gerado:', outputPath);
}

generateTemplate();
