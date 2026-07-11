/**
 * Validate that a string contains readable text (not binary/corrupted data).
 * Returns true if the text appears valid/readable.
 */
function isReadableText(text: string): boolean {
  if (!text || text.length === 0) return true;
  // Check for control characters (except tab, newline, carriage return)
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/.test(text)) return false;
  // Check for replacement character or garbled encoding markers
  if (text.includes('\uFFFD')) return false;
  // Check for XML/binary patterns that shouldn't be in names
  if (text.includes('<?xml') || text.includes('<BODY') || text.includes('<OBJECT')) return false;
  // Check for excessive non-printable/non-latin characters (likely binary data)
  const printablePattern = /^[\x20-\x7E\xA0-\xFF\u0100-\u024F\u0300-\u036F\u2000-\u206F\u2190-\u21FF\u2500-\u257F\s]+$/;
  if (text.length > 20 && !printablePattern.test(text)) {
    // Count how many chars are clearly non-text
    const nonTextChars = (text.match(/[^\x20-\x7E\xA0-\xFF\u0100-\u024F\u0300-\u036F\s.,;:()\/\-_@#!?'"áéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇàèìòùÀÈÌÒÙ]/g) || []).length;
    if (nonTextChars > text.length * 0.3) return false;
  }
  return true;
}

export { isReadableText };

/**
 * Parse the new structured matrix format:
 * Line 1: Area name
 * Line 2: Month/Year (e.g., "Julho/2026")
 * Line 3: Empty
 * Line 4: Headers (Colaborador | Cargo | Contato | Nível | 01 | 02 | ... | 31)
 * Lines 5+: Data rows
 */
export function parseStructuredMatrixCSV(csvContent: string, sheetName?: string): EscalationCSVResult | null {
  const lines = csvContent.split(/\r?\n/);
  if (lines.length < 5) return null;

  const row0 = parseCSVRow(lines[0]);
  const row1 = parseCSVRow(lines[1]);

  // Detect: Line 1 = area name (non-empty, single value), Line 2 = month/year
  const areaName = (row0[0] || '').trim();
  const monthYearRaw = (row1[0] || '').trim();
  
  if (!areaName || areaName.length < 3) return null;
  if (!isReadableText(areaName)) return null;

  // Parse month/year from line 2 (formats: "Julho/2026", "07/2026", "Agosto 2026")
  let importMonth = 0, importYear = 0;
  const monthNames: Record<string, number> = {
    'janeiro': 1, 'fevereiro': 2, 'março': 3, 'marco': 3, 'abril': 4,
    'maio': 5, 'junho': 6, 'julho': 7, 'agosto': 8, 'setembro': 9,
    'outubro': 10, 'novembro': 11, 'dezembro': 12,
  };
  
  const monthMatch = monthYearRaw.toLowerCase().match(/(\w+)\s*[\/\-]?\s*(\d{4})/);
  if (monthMatch) {
    const monthStr = monthMatch[1];
    importYear = parseInt(monthMatch[2]);
    importMonth = monthNames[monthStr] || parseInt(monthStr) || 0;
  }
  
  if (!importMonth || !importYear) {
    // Fallback: use current month
    const now = new Date();
    const brasiliaStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    const brasiliaDate = new Date(brasiliaStr);
    importMonth = brasiliaDate.getMonth() + 1;
    importYear = brasiliaDate.getFullYear();
  }

  // Find header row (should be line 3 or 4, contains "Colaborador" or day numbers)
  let headerRowIdx = -1;
  let colabCol = 0, cargoCol = 1, contatoCol = 2, nivelCol = 3, dayStartCol = 4;

  for (let i = 2; i < Math.min(6, lines.length); i++) {
    const row = parseCSVRow(lines[i]);
    const rowLower = row.map(c => c.trim().toLowerCase());
    if (rowLower.includes('colaborador') || rowLower.includes('nome') || rowLower.includes('plantonista')) {
      headerRowIdx = i;
      for (let j = 0; j < row.length; j++) {
        const cell = rowLower[j];
        if (cell === 'colaborador' || cell === 'nome' || cell === 'plantonista') colabCol = j;
        if (cell === 'cargo' || cell === 'função') cargoCol = j;
        if (cell === 'contato' || cell === 'telefone' || cell === 'celular') contatoCol = j;
        if (cell === 'nível' || cell === 'nivel' || cell === 'escalão' || cell === 'escalao') nivelCol = j;
      }
      // Find where day columns start (first column with "01" or "1")
      for (let j = 0; j < row.length; j++) {
        const cell = row[j].trim();
        if (/^0?1$/.test(cell)) { dayStartCol = j; break; }
      }
      break;
    }
  }

  if (headerRowIdx === -1) return null;

  // Parse data rows
  const entries: EscalationEntry[] = [];
  const areas: ParsedEscalation[] = [];
  const finalAreaName = sheetName || areaName;
  const currentArea: ParsedEscalation = { area: finalAreaName, colaboradores: [] };
  areas.push(currentArea);

  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    const nome = (row[colabCol] || '').trim();
    if (!nome || !isReadableText(nome)) continue;
    if (nome.toLowerCase() === 'colaborador' || nome.toLowerCase() === 'nome') continue;

    const cargo = (row[cargoCol] || '').trim();
    const contato = (row[contatoCol] || '').trim();
    const nivel = (row[nivelCol] || '').trim() || '1º Escalão';

    const escalas: Array<{ dia: number; horarioInicio: string; horarioFim: string; is24h: boolean }> = [];

    for (let dayIdx = 0; dayIdx < 31; dayIdx++) {
      const colIdx = dayStartCol + dayIdx;
      if (colIdx >= row.length) break;
      const cellValue = (row[colIdx] || '').trim();
      if (!cellValue || cellValue === '—' || cellValue === '-') continue;

      let parsed = parseTimeRangeSimple(cellValue);
      if (!parsed && /^[xXsS✓✔]$/.test(cellValue)) {
        parsed = { inicio: '00:00', fim: '23:59', is24h: true };
      }

      if (parsed) {
        const dia = dayIdx + 1;
        escalas.push({ dia, horarioInicio: parsed.inicio, horarioFim: parsed.fim, is24h: parsed.is24h });
        entries.push({
          area: finalAreaName,
          colaborador: nome,
          cargo,
          nivel,
          contato,
          dia,
          horarioInicio: parsed.inicio,
          horarioFim: parsed.fim,
          is24h: parsed.is24h,
        });
      }
    }

    currentArea.colaboradores.push({ nome, cargo, nivel, contato, escalas });
  }

  if (entries.length === 0 && currentArea.colaboradores.length === 0) return null;

  return { areas, entries, errors: [], importMonth, importYear };
}

/**
 * Simple time range parser for the matrix format.
 * Handles: "18:00-06:00", "18:00 às 06:00", "24hs", "24h", "08:00-08:00"
 */
function parseTimeRangeSimple(raw: string): { inicio: string; fim: string; is24h: boolean } | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  // 24h formats
  if (/^24h(s|rs)?$/i.test(cleaned)) {
    return { inicio: '00:00', fim: '23:59', is24h: true };
  }

  // "HH:MM-HH:MM" or "HH:MM às HH:MM" or "HH:MM - HH:MM"
  const match = cleaned.match(/(\d{1,2}:\d{2})\s*[-–àáãa]s?\s*(\d{1,2}:\d{2})/i);
  if (match) {
    const inicio = match[1].padStart(5, '0');
    const fim = match[2].padStart(5, '0');
    const is24h = (inicio === fim) || (inicio === '08:00' && fim === '08:00');
    return { inicio, fim, is24h };
  }

  return null;
}

/**
 * Processor for the escalation CSV format.
 * 
 * Format:
 * - Rows with only column A filled (all caps) = Area headers
 * - Data rows: Colaborador, Cargo, Nível, (empty), Contato, Day1, Day2, ... Day31
 * - Day columns contain shift times like "18:00 às 00:00", "24hs", "08:00 às 00:00", or empty
 */

/**
 * Normalize a string for comparison by removing accents, special chars, and garbled encoding.
 * "TORRE SOLU��ES LOG�STICAS" and "TORRE SOLUÇÕES LOGÍSTICAS" both become "torre solucoes logisticas"
 */
function normalizeForComparison(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove accents
    .replace(/[�]/g, '')             // remove garbled chars
    .replace(/[^a-z0-9\s]/g, '')     // remove non-alphanumeric
    .replace(/\s+/g, ' ')
    .trim();
}

export { normalizeForComparison };

export interface EscalationEntry {
  area: string;
  colaborador: string;
  cargo: string;
  nivel: string; // "1º Escalão", "2º Escalão", "3º Escalão", "4º Escalão", "Direto"
  contato: string;
  dia: number; // day of month (1-31)
  horarioInicio: string; // "18:00", "00:00", "08:00", "06:40"
  horarioFim: string; // "00:00", "08:00", "23:00", "06:40"
  is24h: boolean;
}

export interface ParsedEscalation {
  area: string;
  colaboradores: Array<{
    nome: string;
    cargo: string;
    nivel: string;
    contato: string;
    escalas: Array<{
      dia: number;
      horarioInicio: string;
      horarioFim: string;
      is24h: boolean;
    }>;
  }>;
}

export interface EscalationCSVResult {
  areas: ParsedEscalation[];
  entries: EscalationEntry[];
  errors: string[];
  importMonth?: number;
  importYear?: number;
}

/**
 * Parse a time range string into start/end times.
 * Handles formats: "18:00 às 00:00", "00:00 as 18:00", "08:00 às 06:00", "24hs", "24h"
 */
function parseTimeRange(raw: string): { inicio: string; fim: string; is24h: boolean } | null {
  const cleaned = raw.trim();
  if (!cleaned || cleaned === '—' || cleaned === '-') return null;

  // Handle 24h formats
  if (cleaned.toLowerCase() === '24hs' || cleaned.toLowerCase() === '24h') {
    return { inicio: '00:00', fim: '23:59', is24h: true };
  }

  // Handle compound ranges like "00:00 - 07:00 / 20:00- 23:59"
  // For compound, take the full range (earliest start to latest end)
  if (cleaned.includes('/')) {
    const parts = cleaned.split('/').map(p => p.trim());
    const ranges = parts.map(p => parseSimpleRange(p)).filter(Boolean) as { inicio: string; fim: string }[];
    if (ranges.length === 0) return null;
    // Return first range for simplicity (or could merge)
    return { inicio: ranges[0].inicio, fim: ranges[ranges.length - 1].fim, is24h: false };
  }

  const simple = parseSimpleRange(cleaned);
  if (!simple) return null;
  return { ...simple, is24h: false };
}

function parseSimpleRange(raw: string): { inicio: string; fim: string } | null {
  // Patterns: "18:00 às 00:00", "00:00 as 18:00", "18:00- 23:59", "00:00 - 07:00"
  // Also handle encoding issues where à becomes � or other garbled chars
  const patterns = [
    /(\d{1,2}:\d{2})\s*[àáãâa\u00e0-\u00ff�]s?\s*(\d{1,2}:\d{2})/i,
    /(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/i,
    /(\d{1,2}:\d{2})\s+\S+\s+(\d{1,2}:\d{2})/i, // catch-all: time <anything> time
  ];

  for (const pattern of patterns) {
    const match = raw.match(pattern);
    if (match) {
      return { inicio: normalizeTime(match[1]), fim: normalizeTime(match[2]) };
    }
  }
  return null;
}

function normalizeTime(t: string): string {
  const parts = t.split(':');
  return `${parts[0].padStart(2, '0')}:${parts[1]}`;
}

/**
 * Determine if a row is an area header.
 * Area headers: first column is filled, rest are mostly empty, text is uppercase or long area-like name
 */
function isAreaHeader(row: string[]): boolean {
  const first = (row[0] || '').trim();
  if (!first) return false;
  // Must not have cargo-like data in columns 1-2
  const second = (row[1] || '').trim();
  const third = (row[2] || '').trim();
  // Area headers have empty cargo and nivel columns
  if (second && third) return false;
  // Check it's not a separator row
  if (first.startsWith('<') || first === 'xxxxx') return false;
  // Area header if mostly uppercase and > 3 chars, OR if rest of row is empty
  const nonEmptyCols = row.filter(c => c.trim()).length;
  if (nonEmptyCols <= 2 && first.length > 3 && first === first.toUpperCase()) return true;
  // Also detect area headers that are title-case but alone in the row
  if (nonEmptyCols === 1 && first.length > 3) return true;
  return false;
}

/**
 * Detect and parse the "Time Cloud" tabular format.
 * Format: Nome | Dia | Data início | Início | Data fim | Fim
 * Optionally includes a "Plantonistas" side-table with full names and contacts,
 * and an "Escalation" section with escalation levels.
 */
function parseTabularFormat(lines: string[]): EscalationCSVResult | null {
  // Detect tabular format by looking for header row with "Nome" + "Data início" or "Início" + "Fim"
  let headerRow = -1;
  let nomeCol = -1;
  let diaCol = -1;
  let dataInicioCol = -1;
  let inicioCol = -1;
  let dataFimCol = -1;
  let fimCol = -1;

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const row = parseCSVRow(lines[i]);
    const rowLower = row.map(c => c.trim().toLowerCase());

    // Look for header with "nome" and ("data início" or "data inicio" or "início" or "inicio") and "fim"
    const hasNome = rowLower.some(c => c === 'nome' || c === 'plantonista' || c === 'colaborador' || c === 'responsável');
    const hasInicio = rowLower.some(c => c === 'início' || c === 'inicio' || c === 'data início' || c === 'data inicio');
    const hasFim = rowLower.some(c => c === 'fim' || c === 'data fim' || c === 'término');

    if (hasNome && hasInicio && hasFim) {
      headerRow = i;
      for (let j = 0; j < row.length; j++) {
        const cell = rowLower[j];
        if (cell === 'nome' || cell === 'plantonista' || cell === 'colaborador' || cell === 'responsável') nomeCol = j;
        if (cell === 'dia' || cell === 'dia da semana') diaCol = j;
        if (cell === 'data início' || cell === 'data inicio') dataInicioCol = j;
        if (cell === 'início' || cell === 'inicio') {
          // Distinguish "Início" (time) from "Data início" (date)
          // If "data início" is already found separately, this is the time column
          if (dataInicioCol !== j && dataInicioCol !== -1) {
            inicioCol = j;
          } else if (dataInicioCol === -1) {
            // Check if there's a separate "Data início" column
            const hasDataInicio = rowLower.some(c => c === 'data início' || c === 'data inicio');
            if (hasDataInicio) {
              inicioCol = j;
            } else {
              dataInicioCol = j;
            }
          }
        }
        if (cell === 'data fim' || cell === 'término') dataFimCol = j;
        if (cell === 'fim' || cell === 'término') {
          if (dataFimCol !== j && dataFimCol !== -1) {
            fimCol = j;
          } else if (dataFimCol === -1) {
            const hasDataFim = rowLower.some(c => c === 'data fim');
            if (hasDataFim) {
              fimCol = j;
            } else {
              dataFimCol = j;
            }
          }
        }
      }
      break;
    }
  }

  if (headerRow === -1 || nomeCol === -1) return null;

  // Re-scan header to properly assign columns (handle case where "Início" is both date and time)
  const headerRowParsed = parseCSVRow(lines[headerRow]);
  const headerLower = headerRowParsed.map(c => c.trim().toLowerCase());

  // Reset and re-detect more carefully
  nomeCol = -1; diaCol = -1; dataInicioCol = -1; inicioCol = -1; dataFimCol = -1; fimCol = -1;
  for (let j = 0; j < headerLower.length; j++) {
    const cell = headerLower[j];
    if ((cell === 'nome' || cell === 'plantonista' || cell === 'colaborador' || cell === 'responsável') && nomeCol === -1) nomeCol = j;
    else if ((cell === 'dia' || cell === 'dia da semana') && diaCol === -1) diaCol = j;
    else if ((cell === 'data início' || cell === 'data inicio') && dataInicioCol === -1) dataInicioCol = j;
    else if ((cell === 'início' || cell === 'inicio') && inicioCol === -1) inicioCol = j;
    else if ((cell === 'data fim' || cell === 'término') && dataFimCol === -1) dataFimCol = j;
    else if ((cell === 'fim' || cell === 'término') && fimCol === -1) fimCol = j;
  }

  // If no separate "inicio" time col, maybe the time is embedded in "Data início" or use the column after dataInicioCol
  if (inicioCol === -1 && dataInicioCol !== -1) {
    // "Data início" might actually be the date, and next col might be time
    // Or this format has date and time in one column
    inicioCol = dataInicioCol + 1;
  }
  if (fimCol === -1 && dataFimCol !== -1) {
    fimCol = dataFimCol + 1;
  }

  // Now scan for the "Plantonistas" side-table to build a contacts map
  const contactsMap: Map<string, { nomeCompleto: string; contato: string }> = new Map();
  // And escalation levels map
  const escalationMap: Map<number, { nome: string; contato: string }> = new Map();

  for (let i = 0; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    // Look for "Plantonistas" label
    for (let j = 0; j < row.length; j++) {
      const cell = row[j].trim().toLowerCase();
      if (cell === 'plantonistas' || cell === 'plantonista') {
        // The rows nearby (same column area) contain name + contact pairs
        // Scan from this row's position to find names in columns around j
        // Typically: col j-1 or j+1 has names, and col j+2 has contacts
        // Looking at the data: Names are in col ~j+1 (full names), contacts in col ~j+2
        for (let k = 0; k < lines.length; k++) {
          const sideRow = parseCSVRow(lines[k]);
          // Look for cells in the area near j that have full names (all caps) and phone numbers
          for (let c = j; c < Math.min(j + 4, sideRow.length); c++) {
            const val = (sideRow[c] || '').trim();
            const nextVal = (sideRow[c + 1] || '').trim();
            // Full name (uppercase, at least 2 words) followed by phone
            if (val && val === val.toUpperCase() && val.split(/\s+/).length >= 2 && /\d/.test(nextVal)) {
              const shortName = buildShortName(val);
              contactsMap.set(shortName, { nomeCompleto: val, contato: nextVal });
            }
          }
        }
        break;
      }
      if (cell === 'escalation' || cell === 'escalonamento') {
        // Parse escalation levels: "1 - Leandro Silva" "24 99266-6604"
        for (let k = i; k < Math.min(i + 10, lines.length); k++) {
          const escRow = parseCSVRow(lines[k]);
          for (let c = j; c < Math.min(j + 4, escRow.length); c++) {
            const val = (escRow[c] || '').trim();
            const levelMatch = val.match(/^(\d+)\s*[-–]\s*(.+)/);
            if (levelMatch) {
              const level = parseInt(levelMatch[1]);
              const nome = levelMatch[2].trim();
              const contato = (escRow[c + 1] || '').trim();
              escalationMap.set(level, { nome, contato });
            }
          }
        }
        break;
      }
    }
  }

  // Parse data rows
  const entries: EscalationEntry[] = [];
  const areasMap: Map<string, ParsedEscalation> = new Map();
  // We'll create a single area "Sobreaviso" or detect from filename/sheet
  // Since this format doesn't have explicit area headers, group by sheet/file name
  // For now, use a default area name that can be overridden
  const defaultAreaName = 'TIME CLOUD';

  for (let i = headerRow + 1; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    const nome = (row[nomeCol] || '').trim();
    if (!nome) continue;
    // Skip header-like rows or section labels
    if (nome.toLowerCase() === 'nome' || nome.toLowerCase() === 'plantonistas' || nome.toLowerCase() === 'escalation') continue;
    // Skip corrupted/binary data
    if (!isReadableText(nome)) continue;

    // Extract date — format: "01/jul", "02/jul", etc.
    const dataInicioRaw = dataInicioCol >= 0 ? (row[dataInicioCol] || '').trim() : '';
    const inicioRaw = inicioCol >= 0 ? (row[inicioCol] || '').trim() : '';
    const fimRaw = fimCol >= 0 ? (row[fimCol] || '').trim() : '';

    if (!inicioRaw && !fimRaw) continue;

    // Parse day from date string
    const dia = parseDayFromDate(dataInicioRaw);
    if (!dia) continue;

    // Normalize time
    const horarioInicio = normalizeTime(inicioRaw);
    const horarioFim = normalizeTime(fimRaw);
    if (!horarioInicio || !horarioFim) continue;

    // Check if it's 24h (08:00-08:00 next day = 24h shift)
    const is24h = (horarioInicio === horarioFim) || 
                  (horarioInicio === '08:00' && horarioFim === '08:00');

    // Find contact from the plantonistas map
    const shortName = normalizeForComparison(nome);
    let contato = '';
    let nomeCompleto = nome;
    for (const [key, val] of contactsMap.entries()) {
      if (normalizeForComparison(key) === shortName || normalizeForComparison(val.nomeCompleto).includes(shortName)) {
        contato = val.contato;
        nomeCompleto = val.nomeCompleto;
        break;
      }
    }
    // Also try partial match
    if (!contato) {
      for (const [key, val] of contactsMap.entries()) {
        const nameParts = shortName.split(' ');
        const fullNameNorm = normalizeForComparison(val.nomeCompleto);
        if (nameParts.length >= 2 && fullNameNorm.includes(nameParts[0]) && fullNameNorm.includes(nameParts[nameParts.length - 1])) {
          contato = val.contato;
          nomeCompleto = val.nomeCompleto;
          break;
        }
      }
    }

    // Determine escalation level (default: direct/1st level)
    const nivel = '1º Escalão';

    const entry: EscalationEntry = {
      area: defaultAreaName,
      colaborador: nome,
      cargo: '',
      nivel,
      contato,
      dia,
      horarioInicio,
      horarioFim,
      is24h,
    };
    entries.push(entry);

    // Build areas structure
    if (!areasMap.has(defaultAreaName)) {
      areasMap.set(defaultAreaName, { area: defaultAreaName, colaboradores: [] });
    }
    const areaObj = areasMap.get(defaultAreaName)!;
    let colab = areaObj.colaboradores.find(c => normalizeForComparison(c.nome) === normalizeForComparison(nome));
    if (!colab) {
      colab = { nome, cargo: '', nivel, contato, escalas: [] };
      areaObj.colaboradores.push(colab);
    }
    colab.escalas.push({ dia, horarioInicio, horarioFim, is24h });
  }

  // Add escalation entries (for the escalation chain contacts)
  for (const [level, data] of escalationMap.entries()) {
    // These are escalation contacts, not shift entries — store them as metadata
    // Add them as collaborators with a special nivel
    if (!areasMap.has(defaultAreaName)) {
      areasMap.set(defaultAreaName, { area: defaultAreaName, colaboradores: [] });
    }
    const areaObj = areasMap.get(defaultAreaName)!;
    const existing = areaObj.colaboradores.find(c => normalizeForComparison(c.nome) === normalizeForComparison(data.nome));
    if (existing) {
      existing.nivel = `${level}º Escalão`;
      existing.contato = existing.contato || data.contato;
      // Update entries too
      entries.filter(e => normalizeForComparison(e.colaborador) === normalizeForComparison(data.nome))
        .forEach(e => { e.nivel = `${level}º Escalão`; e.contato = e.contato || data.contato; });
    }
  }

  const areas = Array.from(areasMap.values());
  return { areas, entries, errors: [] };
}

/**
 * Parse day of month from date strings like "01/jul", "15/ago", "1/jul", "2026-07-01", "01/07"
 */
function parseDayFromDate(raw: string): number | null {
  if (!raw) return null;
  const cleaned = raw.trim();

  // Format: "01/jul", "1/jul", "15/ago"
  const brMatch = cleaned.match(/^(\d{1,2})\/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i);
  if (brMatch) return parseInt(brMatch[1]);

  // Format: "01/07", "1/7"
  const numMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})/);
  if (numMatch) return parseInt(numMatch[1]);

  // Format: "2026-07-01"
  const isoMatch = cleaned.match(/^\d{4}-\d{2}-(\d{2})/);
  if (isoMatch) return parseInt(isoMatch[1]);

  // Just a number
  const numOnly = parseInt(cleaned);
  if (!isNaN(numOnly) && numOnly >= 1 && numOnly <= 31) return numOnly;

  return null;
}

/**
 * Build a short name key from a full name for matching.
 * "VITOR MORAIS CLAUZ" → "vitor clauz" (first + last)
 */
function buildShortName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 2) return fullName.toLowerCase();
  return `${parts[0]} ${parts[parts.length - 1]}`.toLowerCase();
}

/**
 * Parse the escalation CSV content.
 * Auto-detects column layout by scanning header rows for day numbers or date patterns.
 * Also supports the "Time Cloud" tabular format (one row per shift).
 */
/**
 * Parse the escalation CSV content.
 * Auto-detects column layout by scanning header rows for day numbers or date patterns.
 * Also supports the "Time Cloud" tabular format (one row per shift).
 * @param csvContent - The CSV content to parse
 * @param sheetName - Optional sheet name to use as area name for tabular format
 */
export function parseEscalationCSV(csvContent: string, sheetName?: string): EscalationCSVResult {
  const errors: string[] = [];
  const areas: ParsedEscalation[] = [];
  const entries: EscalationEntry[] = [];

  // Split into lines and parse CSV (handling quoted fields)
  const lines = csvContent.split(/\r?\n/);

  // Try structured matrix format first (new template: Area name on line 1, Month/Year on line 2)
  const structuredResult = parseStructuredMatrixCSV(csvContent, sheetName);
  if (structuredResult && (structuredResult.entries.length > 0 || structuredResult.areas[0]?.colaboradores.length > 0)) {
    return structuredResult;
  }

  // Try tabular format (Time Cloud format: Nome | Dia | Data início | Início | Data fim | Fim)
  const tabularResult = parseTabularFormat(lines);
  if (tabularResult && tabularResult.entries.length > 0) {
    // Use sheet name as area name if provided
    if (sheetName) {
      const areaName = sheetName.trim();
      for (const area of tabularResult.areas) {
        area.area = areaName;
      }
      for (const entry of tabularResult.entries) {
        entry.area = areaName;
      }
    }
    return tabularResult;
  }

  // === Auto-detect column layout ===
  // Look for a header row that contains day numbers (1,2,3...31) or day names (seg, ter, qua...)
  let dayStartCol = 5; // default
  let nameCol = 0;
  let cargoCol = 1;
  let nivelCol = 2;
  let contatoCol = 4;
  let startLine = 0;
  let headerDetected = false;

  for (let i = 0; i < Math.min(10, lines.length); i++) {
    const row = parseCSVRow(lines[i]);
    const rowLower = row.map(c => c.trim().toLowerCase());

    // Detect header row with column names
    if (rowLower.some(c => c === 'colaborador' || c === 'colaboradores' || c === 'nome' || c === 'plantonista')) {
      // Found the column header row
      for (let j = 0; j < row.length; j++) {
        const cell = rowLower[j];
        if (cell === 'colaborador' || cell === 'colaboradores' || cell === 'nome' || cell === 'plantonista') nameCol = j;
        if (cell === 'cargo' || cell === 'função' || cell === 'funcao') cargoCol = j;
        if (cell === 'nível' || cell === 'nivel' || cell === 'escalão' || cell === 'escalao') nivelCol = j;
        if (cell === 'contato' || cell === 'contato corporativo' || cell === 'telefone' || cell === 'celular') contatoCol = j;
      }
      startLine = i + 1;
      headerDetected = true;

      // Find where day columns start: look for columns with numbers 1-31 or day-of-week names
      for (let j = 0; j < row.length; j++) {
        const cell = row[j].trim();
        if (/^[0-9]{1,2}$/.test(cell) && parseInt(cell) >= 1 && parseInt(cell) <= 31) {
          dayStartCol = j;
          break;
        }
        // Also detect date-like headers: "01/07", "2026-07-01", etc.
        if (/^\d{1,2}\/\d{1,2}/.test(cell) || /^\d{4}-\d{2}-\d{2}/.test(cell)) {
          dayStartCol = j;
          break;
        }
      }
      continue;
    }

    // Alternative: detect by looking for row with many numbers (day row under header)
    if (!headerDetected && rowLower.some(c => /^(seg|ter|qua|qui|sex|sab|dom|segunda|terça|quarta|quinta|sexta|sábado|domingo)/.test(c))) {
      startLine = i + 1;
      // The row above might be the day numbers
      if (i > 0) {
        const prevRow = parseCSVRow(lines[i - 1]);
        for (let j = 0; j < prevRow.length; j++) {
          const cell = prevRow[j].trim();
          if (/^[0-9]{1,2}$/.test(cell) && parseInt(cell) >= 1 && parseInt(cell) <= 31) {
            dayStartCol = j;
            break;
          }
        }
      }
      continue;
    }

    // Legacy detection: skip known header patterns
    if (lines[i].includes('ESCALONAMENTO VIGENTE') || lines[i].includes('Colaboradores') || lines[i].includes('Contato Corporativo')) {
      startLine = i + 1;
    }
  }

  let currentArea: ParsedEscalation | null = null;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const row = parseCSVRow(line);

    // Check if this is an area header
    if (isAreaHeader(row)) {
      currentArea = { area: row[0].trim(), colaboradores: [] };
      areas.push(currentArea);
      continue;
    }

    // Skip empty-ish rows or placeholder rows
    const nome = (row[nameCol] || '').trim();
    if (!nome || nome === 'xxxxx' || nome.startsWith('<')) continue;
    // Skip corrupted/binary data
    if (!isReadableText(nome)) continue;

    // This is a collaborator row
    if (!currentArea) continue;

    const cargo = (row[cargoCol] || '').trim();
    const nivel = (row[nivelCol] || '').trim();
    const contato = (row[contatoCol] || '').trim();

    // Parse day columns
    const escalas: Array<{ dia: number; horarioInicio: string; horarioFim: string; is24h: boolean }> = [];

    for (let dayIdx = 0; dayIdx < 31; dayIdx++) {
      const colIdx = dayStartCol + dayIdx;
      if (colIdx >= row.length) break;
      const cellValue = (row[colIdx] || '').trim();
      
      if (!cellValue || cellValue === '—' || cellValue === '-') continue;

      // Check if cell contains a time pattern or "X" / "x" (marking presence)
      let parsed = parseTimeRange(cellValue);
      
      // If cell just has "X" or "x" or "S" (sobreaviso), treat as 24h
      if (!parsed && /^[xXsS✓✔]$/.test(cellValue)) {
        parsed = { inicio: '00:00', fim: '23:59', is24h: true };
      }

      if (parsed) {
        escalas.push({
          dia: dayIdx + 1,
          horarioInicio: parsed.inicio,
          horarioFim: parsed.fim,
          is24h: parsed.is24h,
        });

        entries.push({
          area: currentArea.area,
          colaborador: nome,
          cargo,
          nivel,
          contato,
          dia: dayIdx + 1,
          horarioInicio: parsed.inicio,
          horarioFim: parsed.fim,
          is24h: parsed.is24h,
        });
      }
    }

    currentArea.colaboradores.push({
      nome,
      cargo,
      nivel,
      contato,
      escalas,
    });
  }

  return { areas, entries, errors };
}

/**
 * Parse a CSV row handling quoted fields properly.
 */
function parseCSVRow(line: string): string[] {
  const delimiter = (line.match(/;/g) || []).length > (line.match(/,/g) || []).length ? ';' : ',';
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

/**
 * Find all people scheduled for today for a given area.
 * Returns everyone who has a shift on the current day (not just current hour).
 */
export function getCurrentOnCallForArea(
  entries: EscalationEntry[],
  area: string,
  now?: Date
): EscalationEntry[] {
  const brasilia = now || new Date();
  const brasiliaStr = brasilia.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
  const brasiliaDate = new Date(brasiliaStr);
  
  const currentDay = brasiliaDate.getDate();
  const areaNorm = normalizeForComparison(area);

  // Return ALL entries for this area on today's date (using normalized comparison)
  return entries.filter(e => 
    normalizeForComparison(e.area) === areaNorm && e.dia === currentDay
  );
}


/**
 * Escape a CSV field value (wrap in quotes if it contains commas, quotes, or newlines).
 */
function escapeCSVField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Format escalation entries as a valid CSV string with UTF-8 encoding.
 * Headers: Area,Colaborador,Cargo,Nivel,Contato,Dia,HorarioInicio,HorarioFim,Is24h
 */
export function formatEscalationCSV(entries: EscalationEntry[]): string {
  const headers = ['Area', 'Colaborador', 'Cargo', 'Nivel', 'Contato', 'Dia', 'HorarioInicio', 'HorarioFim', 'Is24h'];
  const lines: string[] = [headers.join(',')];

  for (const entry of entries) {
    const row = [
      escapeCSVField(entry.area),
      escapeCSVField(entry.colaborador),
      escapeCSVField(entry.cargo),
      escapeCSVField(entry.nivel),
      escapeCSVField(entry.contato),
      String(entry.dia),
      entry.horarioInicio,
      entry.horarioFim,
      entry.is24h ? '1' : '0',
    ];
    lines.push(row.join(','));
  }

  return lines.join('\n');
}
