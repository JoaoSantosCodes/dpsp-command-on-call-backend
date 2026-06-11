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
 * Area headers: first column is filled, rest are mostly empty, text is uppercase
 */
function isAreaHeader(row: string[]): boolean {
  const first = (row[0] || '').trim();
  if (!first) return false;
  // Must be mostly uppercase and not have a cargo (2nd column empty or same area-like)
  const second = (row[1] || '').trim();
  const third = (row[2] || '').trim();
  // Area headers have empty cargo and nivel columns
  if (second || third) return false;
  // Check it's not a separator row
  if (first.startsWith('<') || first === 'xxxxx') return false;
  return first === first.toUpperCase() && first.length > 3;
}

/**
 * Parse the escalation CSV content.
 */
export function parseEscalationCSV(csvContent: string): EscalationCSVResult {
  const errors: string[] = [];
  const areas: ParsedEscalation[] = [];
  const entries: EscalationEntry[] = [];

  // Split into lines and parse CSV manually (handling commas in fields)
  const lines = csvContent.split(/\r?\n/);
  
  // Skip header rows (first 3 lines: title, column names, weekday names)
  let startLine = 0;
  for (let i = 0; i < Math.min(5, lines.length); i++) {
    if (lines[i].includes('ESCALONAMENTO VIGENTE') || lines[i].includes('Colaboradores') || lines[i].includes('Contato Corporativo')) {
      startLine = i + 1;
    }
  }

  let currentArea: ParsedEscalation | null = null;

  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    const row = line.split(',');

    // Check if this is an area header
    if (isAreaHeader(row)) {
      currentArea = { area: row[0].trim(), colaboradores: [] };
      areas.push(currentArea);
      continue;
    }

    // Skip empty-ish rows or placeholder rows
    const nome = (row[0] || '').trim();
    if (!nome || nome === 'xxxxx' || nome.startsWith('<')) continue;

    // This is a collaborator row
    if (!currentArea) continue;

    const cargo = (row[1] || '').trim();
    const nivel = (row[2] || '').trim();
    const contato = (row[4] || '').trim();

    // Parse day columns (columns 5 onwards = day 1, day 2, ...)
    const escalas: Array<{ dia: number; horarioInicio: string; horarioFim: string; is24h: boolean }> = [];

    for (let dayIdx = 0; dayIdx < 31; dayIdx++) {
      const colIdx = 5 + dayIdx; // Day columns start at index 5
      const cellValue = (row[colIdx] || '').trim();
      
      if (!cellValue || cellValue === '—' || cellValue === '-') continue;

      const parsed = parseTimeRange(cellValue);
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
