import { normalizeForComparison } from './escalation-csv-processor';

/**
 * Auto-mapping of monitors to areas/teams based on keywords in the monitor name or tags.
 * 
 * Rules:
 * - If monitor name contains "redis" or "kubernetes" → DEVOPS/CLOUD (always)
 * - Additionally, if the name contains an application keyword, it maps to that area too
 * - DevOps is always a secondary responsible for ALL monitors
 */

export interface AreaKeywordMapping {
  area: string;
  keywords: string[];
}

// Mapping configuration: keywords in monitor name → area
export const AREA_KEYWORD_MAPPINGS: AreaKeywordMapping[] = [
  // TORRE SOLUÇÕES DE SAÚDE
  { area: 'TORRE SOLUÇÕES DE SAÚDE', keywords: ['farmacia', 'farmaciav2', 'gdb', 'med espec'] },
  
  // INTEGRAÇÕES (CPI/ODI/OGG)
  { area: 'INTEGRAÇÕES (CPI/ODI/OGG)', keywords: ['integracao', 'integração', 'cpi', 'odi', 'ogg', 'plataforma comercial', 'custom'] },

  // TORRE DIGITAIS
  { area: 'TORRE DIGITAIS', keywords: ['tms', 'lmp', 'frank', 'acomp', 'omsv2', 'omsv3'] },

  // TORRE LOGÍSTICA
  { area: 'TORRE SOLUÇÕES LOGÍSTICAS', keywords: ['estoque', 'estoque unico', 'estoque único'] },

  // TORRE COMERCIAL
  { area: 'TORRE COMERCIAL', keywords: ['cupons', 'desconto', 'syncros', 'orion', 'price'] },

  // TORRE CORPORATIVOS
  { area: 'SOLUÇÕES CORPORATIVAS', keywords: ['tax', 'quadro de loja', 'rh', 'evitaliza'] },

  // TORRE LOJAS
  { area: 'TORRE SOLUÇÕES DE LOJAS', keywords: ['pdv', 'tira-teima', 'filipeta', 'prateleira infinita', 'otimiza', 'brigada de validade'] },

  // DEVOPS/CLOUD (redis, kubernetes, k8s, pods, containers)
  { area: 'DEVOPS/CLOUD', keywords: ['redis', 'kubernetes', 'k8s', 'pod', 'pods', 'container', 'kube', 'deployment', 'hpa', 'kong'] },

  // REDES
  { area: 'REDES', keywords: ['rede', 'network', 'firewall', 'vpn', 'dns'] },

  // SEGURANÇA DA INFORMAÇÃO
  { area: 'SEGURANÇA DA INFORMAÇÃO', keywords: ['seguranca', 'segurança', 'security', 'waf'] },

  // COMMAND CENTER
  { area: 'COMMAND CENTER', keywords: ['command center', 'command_center'] },

  // INFRAESTRUTURA DATA CENTER
  { area: 'INFRAESTRUTURA DATA CENTER', keywords: ['datacenter', 'data center', 'oracle', 'mongodb', 'opensearch', 'elasticsearch'] },
];

/**
 * Find which areas a monitor belongs to, based on its name and tags.
 * DevOps only appears when monitor name contains redis/kubernetes keywords.
 */
export function getAreasForMonitor(monitorName: string, tags?: string[]): string[] {
  const nameLower = monitorName.toLowerCase();
  const tagsLower = (tags || []).map(t => t.toLowerCase());

  const matchedAreas: Set<string> = new Set();

  for (const mapping of AREA_KEYWORD_MAPPINGS) {
    for (const keyword of mapping.keywords) {
      if (nameLower.includes(keyword.toLowerCase()) || tagsLower.some(t => t.includes(keyword.toLowerCase()))) {
        matchedAreas.add(mapping.area);
        break;
      }
    }
  }

  return [...matchedAreas];
}

/**
 * Determine the primary application area (non-DevOps) for a monitor.
 */
export function getPrimaryAreaForMonitor(monitorName: string, tags?: string[]): string | null {
  const areas = getAreasForMonitor(monitorName, tags);
  const primary = areas.find(a => a !== 'DEVOPS/CLOUD');
  return primary || null;
}
