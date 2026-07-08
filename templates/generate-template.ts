/**
 * Script to generate the escalation template XLSX file.
 * Run with: npx tsx templates/generate-template.ts
 */
import XLSX from 'xlsx';
import path from 'path';

function generateTemplate() {
  const wb = XLSX.utils.book_new();

  // === Sheet "Exemplo - Time Cloud" (tabular format) ===
  const tabularData = [
    // Header row
    ['Nome', '', 'Dia', '', 'Data início', '', 'Início', '', 'Data fim', '', 'Fim', '', '', '', '', 'Plantonistas', ''],
    // Example data rows (with plantonistas side-table)
    ['João Silva', '', 'Terça', '', '01/jul', '', '18:00', '', '02/jul', '', '06:00', '', '', '', '', 'JOÃO DA SILVA', '11 99999-1111'],
    ['Maria Santos', '', 'Quarta', '', '02/jul', '', '18:00', '', '03/jul', '', '06:00', '', '', '', '', 'MARIA DOS SANTOS', '11 99999-2222'],
    ['Pedro Costa', '', 'Quinta', '', '03/jul', '', '18:00', '', '04/jul', '', '06:00', '', '', '', '', 'PEDRO HENRIQUE COSTA', '21 99999-3333'],
    ['Ana Oliveira', '', 'Sexta', '', '04/jul', '', '18:00', '', '05/jul', '', '08:00', '', '', '', '', 'ANA CAROLINA OLIVEIRA', '11 99999-4444'],
    ['João Silva', '', 'Sábado', '', '05/jul', '', '08:00', '', '06/jul', '', '08:00', '', '', '', '', 'CARLOS EDUARDO LIMA', '14 99999-5555'],
    ['Maria Santos', '', 'Domingo', '', '06/jul', '', '08:00', '', '07/jul', '', '06:00', '', '', '', '', '', ''],
    ['Pedro Costa', '', 'Segunda', '', '07/jul', '', '18:00', '', '08/jul', '', '06:00', '', '', '', '', 'Escalation', ''],
    ['Carlos Lima', '', 'Terça', '', '08/jul', '', '18:00', '', '09/jul', '', '06:00', '', '', '', '', '1 - Gerente Fulano', '11 99999-8888'],
    ['Ana Oliveira', '', 'Quarta', '', '09/jul', '', '18:00', '', '10/jul', '', '06:00', '', '', '', '', '2 - Diretor Ciclano', '11 99999-9999'],
    ['João Silva', '', 'Quinta', '', '10/jul', '', '18:00', '', '11/jul', '', '06:00', '', '', '', '', '3 - VP Beltrano', ''],
  ];

  const ws1 = XLSX.utils.aoa_to_sheet(tabularData);

  // Set column widths
  ws1['!cols'] = [
    { wch: 18 }, // Nome
    { wch: 2 },  // spacer
    { wch: 10 }, // Dia
    { wch: 2 },  // spacer
    { wch: 12 }, // Data início
    { wch: 2 },  // spacer
    { wch: 8 },  // Início
    { wch: 2 },  // spacer
    { wch: 12 }, // Data fim
    { wch: 2 },  // spacer
    { wch: 8 },  // Fim
    { wch: 2 },  // spacer
    { wch: 2 },  // spacer
    { wch: 2 },  // spacer
    { wch: 2 },  // spacer
    { wch: 30 }, // Plantonistas names
    { wch: 16 }, // Contato
  ];

  XLSX.utils.book_append_sheet(wb, ws1, 'Exemplo - Time Cloud');

  // === Sheet "Exemplo - Matricial" (original matrix format) ===
  const matrixData = [
    // Header rows
    ['ÁREA EXEMPLO - INFRAESTRUTURA'],
    ['Colaborador', 'Cargo', 'Nível', '', 'Contato', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'],
    ['João Silva', 'Analista SR', '1º Escalão', '', '11 99999-1111', '18:00 às 06:00', '', '', '18:00 às 06:00', '', '', '', '18:00 às 06:00', '', '', '', '', '18:00 às 06:00', '', ''],
    ['Maria Santos', 'Analista PL', '1º Escalão', '', '11 99999-2222', '', '18:00 às 06:00', '', '', '18:00 às 06:00', '', '', '', '18:00 às 06:00', '', '', '', '', '18:00 às 06:00', ''],
    ['Pedro Costa', 'Analista JR', '2º Escalão', '', '21 99999-3333', '', '', '18:00 às 06:00', '', '', '08:00 às 08:00', '', '', '', '18:00 às 06:00', '', '24hs', '', '', ''],
    ['Ana Oliveira', 'Especialista', '1º Escalão', '', '11 99999-4444', '', '', '', '', '', '', '08:00 às 08:00', '', '', '', '18:00 às 06:00', '', '', '', '18:00 às 06:00'],
    ['Carlos Lima', 'Coordenador', '2º Escalão', '', '14 99999-5555', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    [],
    ['ÁREA EXEMPLO - CLOUD'],
    ['Colaborador', 'Cargo', 'Nível', '', 'Contato', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'],
    ['Lucas Ferreira', 'DevOps SR', '1º Escalão', '', '11 99999-6666', '18:00 às 06:00', '', '18:00 às 06:00', '', '', '08:00 às 08:00', '', '18:00 às 06:00', '', '', '', '', '18:00 às 06:00', '', ''],
    ['Bruna Almeida', 'SRE', '1º Escalão', '', '11 99999-7777', '', '18:00 às 06:00', '', '18:00 às 06:00', '', '', '08:00 às 08:00', '', '18:00 às 06:00', '', '', '', '', '18:00 às 06:00', ''],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(matrixData);
  ws2['!cols'] = [
    { wch: 20 }, // Colaborador
    { wch: 14 }, // Cargo
    { wch: 12 }, // Nível
    { wch: 2 },  // spacer
    { wch: 16 }, // Contato
    ...Array(15).fill({ wch: 14 }), // Day columns
  ];

  XLSX.utils.book_append_sheet(wb, ws2, 'Exemplo - Matricial');

  // === Sheet "Instruções" ===
  const instructionsData = [
    ['INSTRUÇÕES DE PREENCHIMENTO'],
    [],
    ['O sistema aceita dois formatos de planilha para importação de escalas de sobreaviso:'],
    [],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['FORMATO 1: TABULAR (Time Cloud)'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    [],
    ['Cada linha representa um turno de sobreaviso. Colunas obrigatórias:'],
    ['  • Nome — Nome curto do plantonista (ex: "João Silva")'],
    ['  • Dia — Dia da semana (opcional, apenas informativo)'],
    ['  • Data início — Data de início no formato DD/mês (ex: "01/jul", "15/ago")'],
    ['  • Início — Horário de início (ex: "18:00", "08:00")'],
    ['  • Data fim — Data de fim no formato DD/mês (ex: "02/jul")'],
    ['  • Fim — Horário de fim (ex: "06:00", "08:00")'],
    [],
    ['Seção lateral "Plantonistas" (opcional mas recomendado):'],
    ['  • Nome completo em MAIÚSCULAS + Telefone de contato na coluna ao lado'],
    ['  • O sistema associa automaticamente "Vitor Clauz" → "VITOR MORAIS CLAUZ" → "11 98312-4847"'],
    [],
    ['Seção lateral "Escalation" (opcional):'],
    ['  • Formato: "1 - Nome do Gestor" + telefone na coluna ao lado'],
    ['  • Define a cadeia de escalonamento para alertas não atendidos'],
    [],
    ['Veja a aba "Exemplo - Time Cloud" para referência.'],
    [],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['FORMATO 2: MATRICIAL (uma linha por colaborador, colunas = dias)'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    [],
    ['Estrutura:'],
    ['  • Linha de cabeçalho de área: Nome da área em MAIÚSCULAS (sozinha na linha)'],
    ['  • Linha de colunas: Colaborador | Cargo | Nível | (vazio) | Contato | 1 | 2 | 3 | ... | 31'],
    ['  • Linhas de dados: Nome, cargo, nível, contato, e horários nos dias correspondentes'],
    [],
    ['Formatos aceitos nos dias:'],
    ['  • "18:00 às 06:00" — turno com horário específico'],
    ['  • "08:00 às 08:00" — turno de 24h'],
    ['  • "24hs" ou "24h" — turno de 24h'],
    ['  • "X" ou "S" — marca presença (será interpretado como turno 24h)'],
    ['  • Vazio — sem plantão nesse dia'],
    [],
    ['Veja a aba "Exemplo - Matricial" para referência.'],
    [],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    ['DICAS'],
    ['━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'],
    [],
    ['• O arquivo pode ser .xlsx ou .csv'],
    ['• Cada aba do Excel pode representar uma área diferente (o nome da aba vira o nome da área)'],
    ['• Se o Excel tiver senha/proteção, remova antes de importar'],
    ['• Use a mesma escrita do nome em todas as ocorrências para o mapeamento funcionar'],
    ['• Após importar, os colaboradores são criados automaticamente com senha padrão "plantonista123"'],
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(instructionsData);
  ws3['!cols'] = [{ wch: 100 }];

  XLSX.utils.book_append_sheet(wb, ws3, 'Instruções');

  // Write file
  const outputPath = path.join(__dirname, 'Template_Escalonamento.xlsx');
  XLSX.writeFile(wb, outputPath);
  console.log('Template generated:', outputPath);
}

generateTemplate();
