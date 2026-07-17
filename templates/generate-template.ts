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
    ['Mês/Ano: (Selecione o mês correto direto no painel do sistema)'],
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
    { wch: 35 }, // Colaborador (widened)
    { wch: 25 }, // Cargo (widened)
    { wch: 18 }, // Contato (widened)
    { wch: 15 }, // Nível (widened)
    ...Array(31).fill({ wch: 13 }), // Days (widened)
  ];
  XLSX.utils.book_append_sheet(wb, ws1, 'DevOps - Cloud');

  // === Blank template sheet ===
  const blankData = [
    ['NOME DA ÁREA AQUI'],
    ['Mês/Ano: (Selecione o mês correto direto no painel do sistema antes de importar)'],
    [],
    ['Colaborador', 'Cargo', 'Contato', 'Nível', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
  ];

  const ws2 = XLSX.utils.aoa_to_sheet(blankData);
  ws2['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 18 }, { wch: 15 }, ...Array(31).fill({ wch: 13 })];
  XLSX.utils.book_append_sheet(wb, ws2, 'Template Vazio');

  // === Instructions ===
  const instrData = [
    ['INSTRUÇÕES DE PREENCHIMENTO — Template de Escalonamento'],
    [],
    ['ESTRUTURA DO ARQUIVO:'],
    ['• Cada aba do Excel = uma área/departamento'],
    ['• O nome da aba identifica a área no sistema (ex: "DevOps", "PDV", "Redes")'],
    [],
    ['ESTRUTURA DA ABA:'],
    ['• Linha 1: Nome da área (importante para identificação)'],
    ['• Linha 2: Informativa (O Mês e Ano reais agora são selecionados na tela do sistema antes de importar!)'],
    ['• Linha 3: Vazia (apenas para separação visual)'],
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
    ['• Preencha com o horário do sobreaviso naquele dia'],
    ['• Formatos recomendados:'],
    ['    - "18:00-06:00" (horário de início e fim separados por hífen)'],
    ['    - "24hs" ou "X" (para sinalizar um plantão de dia inteiro)'],
    ['    - Deixe VAZIO se não houver plantão no dia'],
    [],
    ['DICAS E REGRAS DA IMPORTAÇÃO:'],
    ['• SELECIONE O MÊS/ANO NO SISTEMA: A planilha será importada para o mês que você selecionar na tela de Importação.'],
    ['• A importação substitui toda a escala do mês selecionado para aquela área.'],
    ['• Plantonistas novos que não existiam no sistema serão criados automaticamente.'],
    ['• Não proteja a planilha com senha, senão o sistema não conseguirá ler os dados.'],
    ['• Múltiplas áreas podem ser importadas juntas, basta criar várias abas no mesmo arquivo Excel.'],
    [],
    ['👉 Veja a aba "DevOps - Cloud" neste arquivo como um exemplo prático já preenchido!'],
  ];

  const ws3 = XLSX.utils.aoa_to_sheet(instrData);
  ws3['!cols'] = [{ wch: 90 }];
  XLSX.utils.book_append_sheet(wb, ws3, 'Instruções');

  const outputPath = path.join(__dirname, 'Template_Escalonamento.xlsx');
  XLSX.writeFile(wb, outputPath);
  console.log('✓ Template gerado:', outputPath);
}

generateTemplate();
