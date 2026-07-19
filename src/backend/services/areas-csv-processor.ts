import { isReadableText } from './escalation-csv-processor';

export interface ParsedAreaCSV {
  torre: string;
  grupo: string;
  aplicacao: string; // nome
  codigo: string;
  coordenadorNome: string;
  coordenadorContato: string;
  gerenteNome: string;
  gerenteContato: string;
}

export function parseAreasCSV(csvContent: string): { areas: ParsedAreaCSV[], errors: string[] } {
  const lines = csvContent.split(/\r?\n/);
  const areas: ParsedAreaCSV[] = [];
  const errors: string[] = [];

  if (lines.length < 2) {
    return { areas, errors: ['O arquivo parece estar vazio.'] };
  }

  // Find headers
  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(/[,;]/).map(h => h.trim());
  
  let colTorre = -1, colGrupo = -1, colAplic = -1, colCodigo = -1;
  let colCoordNome = -1, colCoordCont = -1, colGerNome = -1, colGerCont = -1;

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (h.includes('torre')) colTorre = i;
    else if (h.includes('grupo') || h.includes('área pai') || h.includes('area pai')) colGrupo = i;
    else if (h.includes('aplicação') || h.includes('aplicacao') || h.includes('nome')) colAplic = i;
    else if (h.includes('código') || h.includes('codigo')) colCodigo = i;
    else if (h.includes('coord') && h.includes('nome')) colCoordNome = i;
    else if (h.includes('coord') && h.includes('contato')) colCoordCont = i;
    else if (h.includes('gerente') && h.includes('nome')) colGerNome = i;
    else if (h.includes('gerente') && h.includes('contato')) colGerCont = i;
    
    // Fallbacks
    if (colCoordNome === -1 && h === 'coordenador') colCoordNome = i;
    if (colGerNome === -1 && h === 'gerente') colGerNome = i;
  }

  // Enforce minimal columns
  if (colAplic === -1) colAplic = 2; // default assuming Torre, Grupo, Aplicacao
  if (colTorre === -1) colTorre = 0;
  if (colGrupo === -1) colGrupo = 1;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Use a simple split since it's just basic fields
    const cols = line.split(/[,;]/).map(c => {
      // Remove quotes if present
      let cleaned = c.trim();
      if (cleaned.startsWith('"') && cleaned.endsWith('"')) {
        cleaned = cleaned.substring(1, cleaned.length - 1).trim();
      }
      return cleaned;
    });

    if (cols.length < 2) continue; // skip broken lines

    const aplicacao = colAplic >= 0 ? cols[colAplic] : '';
    if (!aplicacao || !isReadableText(aplicacao)) continue;

    const torre = colTorre >= 0 ? cols[colTorre] : '';
    const grupo = colGrupo >= 0 ? cols[colGrupo] : '';
    
    // Generate code if missing
    let codigo = colCodigo >= 0 ? cols[colCodigo] : '';
    if (!codigo) codigo = aplicacao.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();

    areas.push({
      torre: torre || '',
      grupo: grupo || '',
      aplicacao,
      codigo,
      coordenadorNome: colCoordNome >= 0 ? (cols[colCoordNome] || '') : '',
      coordenadorContato: colCoordCont >= 0 ? (cols[colCoordCont] || '') : '',
      gerenteNome: colGerNome >= 0 ? (cols[colGerNome] || '') : '',
      gerenteContato: colGerCont >= 0 ? (cols[colGerCont] || '') : ''
    });
  }

  return { areas, errors };
}
