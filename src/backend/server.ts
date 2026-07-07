import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { DatadogPollingService } from './services/datadog-polling';
import { EscalationEngine } from './services/escalation-engine';
import { ScheduleManager } from './services/schedule-manager';
import { MonitorMappingService } from './services/monitor-mapping';
import { IncidentHistoryService } from './services/incident-history';
import { CSVProcessor } from './services/csv-processor';
import { normalizeForComparison, hasGarbledCharacters } from '../shared/normalize';
import { parseEscalationCSV, getCurrentOnCallForArea, EscalationEntry } from './services/escalation-csv-processor';
import { getAreasForMonitor, getPrimaryAreaForMonitor } from './services/monitor-area-mapping';
import { AuthService } from './services/auth';
import { createAuthMiddleware, roleMiddleware, areaFilterMiddleware, createAreaFilterMiddleware, getEffectiveAreaFilter, getEffectiveAreas, writeBlockMiddleware } from './middleware/auth';
import { resolveAreaFallback } from './services/dashboard-fallback';
import { TeamRepository } from './database/repositories/TeamRepository';
import { UserRepository } from './database/repositories/UserRepository';
import { AreaRepository } from './database/repositories/AreaRepository';
import { PeriodoRepository } from './database/repositories/PeriodoRepository';
import { EscalaRepository } from './database/repositories/EscalaRepository';
import { UserAreaRepository } from './database/repositories/UserAreaRepository';
import { ProblemaRepository } from './database/repositories/ProblemaRepository';
import { UserPermissionRepository } from './database/repositories/UserPermissionRepository';
import { AreaEscalationChainRepository } from './database/repositories/AreaEscalationChainRepository';
import { MonitorAreaMappingRepository } from './database/repositories/MonitorAreaMappingRepository';
import { EscalationChainMember, HistoryFilters } from '../shared/types';

export interface ServerDependencies {
  datadogPollingService: DatadogPollingService;
  escalationEngine: EscalationEngine;
  scheduleManager: ScheduleManager;
  monitorMappingService: MonitorMappingService;
  incidentHistoryService: IncidentHistoryService;
  csvProcessor: CSVProcessor;
  teamRepository: TeamRepository;
  authService?: AuthService;
  userRepository?: UserRepository;
  areaRepository?: AreaRepository;
  periodoRepository?: PeriodoRepository;
  escalaRepository?: EscalaRepository;
  userAreaRepository?: UserAreaRepository;
  areaEscalationChainRepository?: AreaEscalationChainRepository;
  monitorAreaMappingRepository?: MonitorAreaMappingRepository;
  problemaRepository?: ProblemaRepository;
  userPermissionRepository?: UserPermissionRepository;
  db?: any; // SQLite database for escalation persistence
}

const upload = multer({ storage: multer.memoryStorage() });

// In-memory store for escalation CSV data (loaded from DB on startup)
let escalationEntries: EscalationEntry[] = [];

// Rate limiter for auth routes (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 15, // máx 15 tentativas por IP
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export function createServer(deps: ServerDependencies): Express {
  const app = express();

  // CORS — permite origens configuradas
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:3000'];

  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Selected-Area'],
  }));

  // Security headers (XSS, clickjacking, sniffing protection)
  app.use(helmet({
    contentSecurityPolicy: false, // Desabilitado para não bloquear o frontend SPA
    crossOriginEmbedderPolicy: false,
  }));

  app.use(express.json());

  // Rate limiting nas rotas de autenticação
  app.use('/api/auth', authLimiter);

  // Load escalation data from database on startup
  if (deps.db) {
    try {
      const rows = deps.db.prepare('SELECT * FROM escalation_schedules').all() as any[];
      escalationEntries = rows.map((r: any) => ({
        area: r.area,
        colaborador: r.colaborador,
        cargo: r.cargo || '',
        nivel: r.nivel || '',
        contato: r.contato || '',
        dia: r.dia,
        horarioInicio: r.horario_inicio,
        horarioFim: r.horario_fim,
        is24h: r.is_24h === 1,
      }));
      console.log(`[CommandCenter] Loaded ${escalationEntries.length} escalation entries from database`);
    } catch { /* table might not exist yet */ }
  }

  // GET /api/status — Status de conexão com Datadog
  app.get('/api/status', (_req: Request, res: Response) => {
    const isRunning = deps.datadogPollingService.isRunning;
    res.json({
      datadog: isRunning ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/monitors — Listar monitores com estado
  app.get('/api/monitors', (_req: Request, res: Response) => {
    const monitors = deps.datadogPollingService.getMonitors();
    res.json(monitors);
  });

  // GET /api/monitors/:id — Detalhes de um monitor específico (template/message)
  app.get('/api/monitors/:id', async (req: Request, res: Response) => {
    const monitorId = parseInt(req.params.id as string, 10);
    if (isNaN(monitorId)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }
    try {
      const client = (deps.datadogPollingService as any).client;
      if (client && client.getMonitorDetails) {
        const details = await client.getMonitorDetails(monitorId);
        if (!details) {
          res.status(404).json({ error: 'Monitor não encontrado' });
          return;
        }
        res.json(details);
      } else {
        // Fallback: return basic info from cached monitors
        const monitors = deps.datadogPollingService.getMonitors();
        const monitor = monitors.find((m) => m.id === monitorId);
        if (!monitor) {
          res.status(404).json({ error: 'Monitor não encontrado' });
          return;
        }
        res.json({ id: monitor.id, name: monitor.name, state: monitor.state, message: 'Detalhes não disponíveis' });
      }
    } catch (err) {
      res.status(500).json({ error: 'Erro ao buscar detalhes do monitor' });
    }
  });

  // GET /api/monitors/:id/responsible — Retorna plantonistas responsáveis pelo monitor (todos escalões)
  app.get('/api/monitors/:id/responsible', (req: Request, res: Response) => {
    const monitorId = parseInt(req.params.id as string, 10);
    if (isNaN(monitorId)) {
      res.status(400).json({ error: 'ID inválido' });
      return;
    }

    // Find the monitor name
    const monitors = deps.datadogPollingService.getMonitors();
    const monitor = monitors.find((m) => m.id === monitorId);
    const monitorName = monitor?.name || '';

    // Get areas responsible for this monitor
    const areas = getAreasForMonitor(monitorName);
    const primaryArea = getPrimaryAreaForMonitor(monitorName);

    // Find ALL plantonistas for each area, ordered by escalation level
    const responsibles = areas.map(area => {
      const onCall = getCurrentOnCallForArea(escalationEntries, area);
      
      // Sort by escalation level: Direto first, then 1º, 2º, 3º, 4º
      const sorted = [...onCall].sort((a, b) => {
        const order = (nivel: string) => {
          if (nivel.toLowerCase().includes('direto')) return 0;
          if (nivel.includes('1')) return 1;
          if (nivel.includes('2')) return 2;
          if (nivel.includes('3')) return 3;
          if (nivel.includes('4')) return 4;
          return 5;
        };
        return order(a.nivel) - order(b.nivel);
      });

      return {
        area,
        isPrimary: area === primaryArea,
        isDevOps: area === 'DEVOPS/CLOUD',
        plantonistas: sorted.map(e => ({
          nome: e.colaborador,
          contato: e.contato,
          cargo: e.cargo,
          nivel: e.nivel,
          horarioInicio: e.horarioInicio,
          horarioFim: e.horarioFim,
          is24h: e.is24h,
        })),
      };
    });

    res.json({
      monitorId,
      monitorName,
      areas,
      primaryArea,
      responsibles,
    });
  });

  // GET /api/areas/public — Listar áreas sem autenticação (para tela de registro)
  if (deps.areaRepository) {
    app.get('/api/areas/public', (_req: Request, res: Response) => {
      const areas = deps.areaRepository!.getAll();
      res.json(areas);
    });
  }

  // GET /api/teams — Listar times com plantonista atual
  app.get('/api/teams', (_req: Request, res: Response) => {
    const teams = deps.teamRepository.getAll();
    const result = teams.map((team) => {
      const currentOnCall = deps.scheduleManager.getCurrentOnCall(team.id);
      const escalationChain = deps.scheduleManager.getEscalationChain(team.id);
      return {
        teamId: team.id,
        teamName: team.name,
        displayOrder: team.displayOrder,
        currentOnCall,
        escalationChainConfigured: escalationChain.length > 0,
      };
    });
    res.json(result);
  });

  // POST /api/teams — Criar novo time
  app.post('/api/teams', (req: Request, res: Response) => {
    const { id, name, displayOrder } = req.body || {};
    if (!id || !name) {
      res.status(400).json({ error: 'id e name são obrigatórios' });
      return;
    }
    if (deps.teamRepository.exists(id)) {
      res.status(400).json({ error: 'Time com este ID já existe' });
      return;
    }
    const team = deps.teamRepository.create({ id, name, displayOrder: displayOrder || 99 });
    res.status(201).json(team);
  });

  // PUT /api/teams/:id — Atualizar time
  app.put('/api/teams/:id', (req: Request, res: Response) => {
    const id = req.params.id as string;
    const team = deps.teamRepository.getById(id);
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    const { name, displayOrder } = req.body || {};
    const updated = deps.teamRepository.update(id, { name, displayOrder });
    res.json(updated);
  });

  // DELETE /api/teams/:id — Deletar time
  app.delete('/api/teams/:id', (req: Request, res: Response) => {
    const id = req.params.id as string;
    const team = deps.teamRepository.getById(id);
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    deps.teamRepository.delete(id);
    res.json({ success: true });
  });

  // GET /api/teams/:id/escalation-chain — Cadeia de escalação
  app.get('/api/teams/:id/escalation-chain', (req: Request, res: Response) => {
    const id = req.params.id as string;
    const team = deps.teamRepository.getById(id);
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    const chain = deps.scheduleManager.getEscalationChain(id);
    res.json(chain);
  });

  // PUT /api/teams/:id/escalation-chain — Atualizar cadeia de escalação
  app.put('/api/teams/:id/escalation-chain', (req: Request, res: Response) => {
    const id = req.params.id as string;
    const team = deps.teamRepository.getById(id);
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }

    const chain: EscalationChainMember[] = req.body;
    if (!Array.isArray(chain)) {
      res.status(400).json({ error: 'Body deve ser um array de membros da cadeia de escalação' });
      return;
    }

    // Task 10.1: Auto-inject area's Responsável at position 2
    // Find the area associated with this team via area filter or team area binding
    let finalChain = [...chain];
    if (deps.userRepository && deps.userAreaRepository) {
      // Try to find a Responsável for the team's area
      // The areaCodigo can be passed as a query param or derived from the request
      const areaCodigo = req.query.areaCodigo as string | undefined;
      if (areaCodigo) {
        const allUsers = deps.userRepository.getAll();
        const responsavel = allUsers.find(u => u.perfil === 'Responsavel' && u.areaCodigo === areaCodigo);
        if (responsavel) {
          // Remove any existing position 2 entry
          finalChain = finalChain.filter(m => m.position !== 2);
          // Insert Responsável at position 2
          const responsavelMember: EscalationChainMember = {
            personName: responsavel.nome,
            personContact: responsavel.username,
            position: 2,
          };
          // Rebuild chain with position 2 locked
          const below2 = finalChain.filter(m => m.position < 2);
          const above2 = finalChain.filter(m => m.position >= 2);
          // Re-number above2 starting from position 3
          const renumbered = above2.map((m, i) => ({ ...m, position: 3 + i }));
          finalChain = [...below2, responsavelMember, ...renumbered];
        }
      }
    }

    deps.scheduleManager.updateEscalationChain(id, finalChain);
    res.json({ success: true });
  });

  // POST /api/schedules/import — Importar CSV (multipart/form-data)
  app.post('/api/schedules/import', upload.single('file'), (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado' });
      return;
    }

    const validationResult = deps.csvProcessor.parseAndValidateBuffer(req.file.buffer);

    if (!validationResult.isValid) {
      res.status(422).json({
        success: false,
        errors: validationResult.errors,
        conflicts: validationResult.conflicts,
      });
      return;
    }

    const importResult = deps.csvProcessor.importSchedule(validationResult.validEntries);
    res.json(importResult);
  });

  // POST /api/escalation/import — Importar CSV de escalonamento (formato área → colaboradores → dias)
  app.post('/api/escalation/import', upload.single('file'), async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado' });
      return;
    }

    // Task 3.1: Detect and strip UTF-8 BOM, with fallback to latin1
    let csvContent: string;
    const buffer = req.file.buffer;
    // Try UTF-8 first
    let decoded = buffer.toString('utf-8');
    // Strip BOM if present
    if (decoded.charCodeAt(0) === 0xFEFF) {
      decoded = decoded.slice(1);
    }
    // Check for garbled characters indicating wrong encoding
    if (hasGarbledCharacters(decoded)) {
      // Fallback to latin1 decoding
      csvContent = buffer.toString('latin1');
    } else {
      csvContent = decoded;
    }

    const result = parseEscalationCSV(csvContent);

    // Store in memory for on-call lookups
    escalationEntries = result.entries;

    // Persist to database
    if (deps.db) {
      const now = new Date();
      const brasiliaStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
      const brasiliaDate = new Date(brasiliaStr);
      const currentMonth = brasiliaDate.getMonth() + 1;
      const currentYear = brasiliaDate.getFullYear();

      // Clear existing entries for this month/year
      deps.db.prepare('DELETE FROM escalation_schedules WHERE mes = ? AND ano = ?').run(currentMonth, currentYear);

      // Insert all new entries
      const insert = deps.db.prepare(
        'INSERT INTO escalation_schedules (area, colaborador, cargo, nivel, contato, dia, mes, ano, horario_inicio, horario_fim, is_24h) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
      );

      const insertAll = deps.db.transaction(() => {
        for (const entry of result.entries) {
          insert.run(
            entry.area,
            entry.colaborador,
            entry.cargo,
            entry.nivel,
            entry.contato,
            entry.dia,
            currentMonth,
            currentYear,
            entry.horarioInicio,
            entry.horarioFim,
            entry.is24h ? 1 : 0
          );
        }
      });
      insertAll();
    }

    // Auto-create areas and users from CSV data
    let areasCreated = 0;
    let usersCreated = 0;

    if (deps.areaRepository && deps.userRepository) {
      const areaRepo = deps.areaRepository;
      const userRepo = deps.userRepository;
      const bcrypt = require('bcrypt');

      for (const parsedArea of result.areas) {
        // Task 3.2: Use normalized comparison to find existing areas
        const allAreas = areaRepo.getAll();
        const normalizedIncoming = normalizeForComparison(parsedArea.area);
        const matchingArea = allAreas.find(
          (a) => normalizeForComparison(a.nome) === normalizedIncoming || normalizeForComparison(a.codigo) === normalizedIncoming
        );

        let areaCodigo: string;
        if (matchingArea) {
          areaCodigo = matchingArea.codigo;
        } else {
          areaCodigo = parsedArea.area.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
          try {
            areaRepo.create({ codigo: areaCodigo, nome: parsedArea.area, torre: null, coordenadorNome: null, coordenadorContato: null, gerenteNome: null, gerenteContato: null });
            areasCreated++;
          } catch { /* skip */ }
        }

        for (const colab of parsedArea.colaboradores) {
          if (!colab.nome || colab.nome === 'xxxxx') continue;

          const username = colab.nome.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '.')
            .replace(/\.+/g, '.').replace(/^\.|\.$/, '')
            .substring(0, 30);

          const existing = userRepo.getByUsername(username);
          if (!existing) {
            const codigo = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            const senhaHash = bcrypt.hashSync('plantonista123', 10);
            try {
              userRepo.create({
                codigo,
                areaCodigo,
                areaSolicitada: null,
                nome: colab.nome,
                perfil: 'Plantonista',
                nivelEscalonamento: null,
                cargo: colab.cargo || null,
                contato: null,
                username,
                senhaHash,
                ativo: true,
                aprovado: true,
              });
              usersCreated++;
            } catch { /* skip duplicates */ }
          }
        }
      }
    }

    res.json({
      success: true,
      areas: result.areas.map(a => ({ nome: a.area, colaboradores: a.colaboradores.length })),
      totalEntries: result.entries.length,
      areasCreated,
      usersCreated,
      errors: result.errors,
    });
  });

  // GET /api/escalation/on-call — Quem está de plantão hoje (por área)
  app.get('/api/escalation/on-call', (_req: Request, res: Response) => {
    // Use only areas from the escalation CSV data (avoids duplicates with DB)
    // Deduplicate by normalized name
    const seenNormalized = new Set<string>();
    const entryAreas: string[] = [];
    
    for (const entry of escalationEntries) {
      const norm = normalizeForComparison(entry.area);
      if (!seenNormalized.has(norm)) {
        seenNormalized.add(norm);
        entryAreas.push(entry.area);
      }
    }

    if (entryAreas.length === 0) {
      if (deps.areaRepository) {
        const dbAreas = deps.areaRepository.getAll();
        res.json(dbAreas.map(a => ({ area: a.nome, plantonistas: [] })));
        return;
      }
      res.json([]);
      return;
    }

    const result = entryAreas.map(area => {
      const onCall = getCurrentOnCallForArea(escalationEntries, area);
      const areaNorm = normalizeForComparison(area);
      
      if (onCall.length > 0) {
        // Tem plantonista hoje — mostra quem está escalado
        return {
          area,
          temPlantonista: true,
          plantonistas: onCall.map(e => ({
            nome: e.colaborador,
            cargo: e.cargo,
            nivel: e.nivel,
            contato: e.contato,
            horarioInicio: e.horarioInicio,
            horarioFim: e.horarioFim,
            is24h: e.is24h,
          })),
        };
      } else {
        // Sem plantonista hoje — mostra toda a equipe da área
        const allTeamMembers = escalationEntries
          .filter(e => normalizeForComparison(e.area) === areaNorm)
          .reduce((acc, e) => {
            if (!acc.find(m => m.nome === e.colaborador)) {
              acc.push({
                nome: e.colaborador,
                cargo: e.cargo,
                nivel: e.nivel,
                contato: e.contato,
                horarioInicio: '',
                horarioFim: '',
                is24h: false,
              });
            }
            return acc;
          }, [] as any[]);

        return {
          area,
          temPlantonista: false,
          plantonistas: allTeamMembers,
        };
      }
    });
    res.json(result);
  });

  // GET /api/escalation/areas — Listar áreas do escalonamento importado
  app.get('/api/escalation/areas', (_req: Request, res: Response) => {
    const areas = [...new Set(escalationEntries.map(e => e.area))];
    res.json(areas);
  });

  // GET /api/escalation/template — Download do template CSV
  app.get('/api/escalation/template', (_req: Request, res: Response) => {
    const fs = require('fs');
    const path = require('path');
    const templatePath = path.join(process.cwd(), 'templates', 'Template_Escalonamento.csv');
    if (fs.existsSync(templatePath)) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=Template_Escalonamento.csv');
      res.sendFile(templatePath);
    } else {
      res.status(404).json({ error: 'Template não encontrado' });
    }
  });

  // GET /api/incidents — Histórico com filtros (query params)
  app.get('/api/incidents', (req: Request, res: Response) => {
    const filters: HistoryFilters = {};

    if (req.query.teamId && typeof req.query.teamId === 'string') {
      filters.teamId = req.query.teamId;
    }
    if (req.query.startDate && typeof req.query.startDate === 'string') {
      filters.startDate = req.query.startDate;
    }
    if (req.query.endDate && typeof req.query.endDate === 'string') {
      filters.endDate = req.query.endDate;
    }
    if (req.query.status && typeof req.query.status === 'string') {
      filters.status = req.query.status as HistoryFilters['status'];
    }

    const incidents = deps.incidentHistoryService.queryHistory(filters);
    res.json(incidents);
  });

  // POST /api/incidents/:id/acknowledge — Confirmar atendimento
  app.post('/api/incidents/:id/acknowledge', (req: Request, res: Response) => {
    const id = req.params.id as string;
    const { personId } = req.body || {};

    if (!personId) {
      res.status(400).json({ error: 'personId é obrigatório' });
      return;
    }

    deps.escalationEngine.acknowledgeIncident(id, personId);
    res.json({ success: true, incidentId: id });
  });

  // GET /api/monitor-mappings — Listar mapeamentos
  app.get('/api/monitor-mappings', (_req: Request, res: Response) => {
    const monitors = deps.datadogPollingService.getMonitors();
    const unmapped = deps.monitorMappingService.getUnmappedMonitors(monitors);
    const teams = deps.teamRepository.getAll();

    const mappingsByTeam: Record<string, any[]> = {};
    for (const team of teams) {
      mappingsByTeam[team.id] = deps.monitorMappingService.getMappingsForTeam(team.id);
    }

    res.json({
      mappings: mappingsByTeam,
      unmapped,
    });
  });

  // PUT /api/monitor-mappings/:monitorId — Associar monitor a time
  app.put('/api/monitor-mappings/:monitorId', (req: Request, res: Response) => {
    const monitorId = parseInt(req.params.monitorId as string, 10);
    if (isNaN(monitorId)) {
      res.status(400).json({ error: 'monitorId deve ser um número válido' });
      return;
    }

    const { teamId, monitorName } = req.body || {};
    if (!teamId) {
      res.status(400).json({ error: 'teamId é obrigatório' });
      return;
    }

    const team = deps.teamRepository.getById(teamId);
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }

    deps.monitorMappingService.setMonitorTeamMapping(
      monitorId,
      teamId,
      monitorName || `Monitor ${monitorId}`
    );
    res.json({ success: true, monitorId, teamId });
  });

  // === Monitor-Area Mapping Routes ===

  if (deps.monitorAreaMappingRepository) {
    const monitorAreaMappingRepo = deps.monitorAreaMappingRepository;

    // PUT /api/monitor-area-mappings/:monitorId — Assign monitor to area
    app.put('/api/monitor-area-mappings/:monitorId', writeBlockMiddleware, (req: Request, res: Response) => {
      const monitorId = parseInt(req.params.monitorId as string, 10);
      if (isNaN(monitorId)) {
        res.status(400).json({ error: 'monitorId deve ser um número válido' });
        return;
      }

      const { areaCodigo, monitorName } = req.body || {};
      if (!areaCodigo) {
        res.status(400).json({ error: 'areaCodigo é obrigatório' });
        return;
      }

      // Validate that the area exists
      if (deps.areaRepository) {
        const area = deps.areaRepository.getByCodigo(areaCodigo);
        if (!area) {
          res.status(400).json({ error: 'Área não encontrada' });
          return;
        }
      }

      monitorAreaMappingRepo.setMapping(monitorId, areaCodigo, monitorName || `Monitor ${monitorId}`);
      res.json({ success: true, monitorId, areaCodigo });
    });

    // GET /api/monitor-area-mappings — Get all monitor-area mappings
    app.get('/api/monitor-area-mappings', (_req: Request, res: Response) => {
      const mappings = monitorAreaMappingRepo.getAllMapped();
      res.json(mappings);
    });

    // GET /api/dashboard/monitors-by-area — Monitors grouped by area with on-call/fallback status
    app.get('/api/dashboard/monitors-by-area', (req: Request, res: Response) => {
      const monitors = deps.datadogPollingService.getMonitors();
      const manualMappings = monitorAreaMappingRepo.getAllMapped();

      // Build a set of manually mapped monitor IDs
      const manualMappedIds = new Set(manualMappings.map(m => m.monitorId));

      // Group monitors by area
      const areaGroups: Record<string, { areaCodigo: string; areaNome: string; monitors: typeof monitors }> = {};
      const unassigned: typeof monitors = [];

      for (const monitor of monitors) {
        // Check manual mapping first
        const manualMapping = manualMappings.find(m => m.monitorId === monitor.id);
        if (manualMapping) {
          const key = manualMapping.areaCodigo;
          if (!areaGroups[key]) {
            // Get area name from repository if available
            let areaNome = manualMapping.areaCodigo;
            if (deps.areaRepository) {
              const area = deps.areaRepository.getByCodigo(manualMapping.areaCodigo);
              if (area) areaNome = area.nome;
            }
            areaGroups[key] = { areaCodigo: key, areaNome, monitors: [] };
          }
          areaGroups[key].monitors.push(monitor);
        } else {
          // Fallback to auto-mapping
          const primaryArea = getPrimaryAreaForMonitor(monitor.name);
          if (primaryArea) {
            // Try to find matching area codigo from area repository
            let areaCodigo = primaryArea;
            let areaNome = primaryArea;
            if (deps.areaRepository) {
              const allAreas = deps.areaRepository.getAll();
              const matchedArea = allAreas.find(a =>
                normalizeForComparison(a.nome) === normalizeForComparison(primaryArea)
              );
              if (matchedArea) {
                areaCodigo = matchedArea.codigo;
                areaNome = matchedArea.nome;
              }
            }
            if (!areaGroups[areaCodigo]) {
              areaGroups[areaCodigo] = { areaCodigo, areaNome, monitors: [] };
            }
            areaGroups[areaCodigo].monitors.push(monitor);
          } else {
            unassigned.push(monitor);
          }
        }
      }

      // Resolve on-call/fallback status per area group (Requirements 5.1, 5.2)
      // Determine the current day in Brasília time
      const now = new Date();
      const brasiliaStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
      const brasiliaDate = new Date(brasiliaStr);
      const todayStr = `${brasiliaDate.getFullYear()}-${String(brasiliaDate.getMonth() + 1).padStart(2, '0')}-${String(brasiliaDate.getDate()).padStart(2, '0')}`;

      const groupsWithOnCall = Object.values(areaGroups).map(group => {
        // Determine if there is a plantonista scheduled today for this area
        let scheduledPlantonista: { nome: string; usuarioCodigo: string } | null = null;

        if (deps.escalaRepository && deps.periodoRepository && deps.userRepository) {
          const escalas = deps.escalaRepository.getByArea(group.areaCodigo);
          const periodos = deps.periodoRepository.getByArea(group.areaCodigo);

          // Find periodos matching today
          const todayPeriodos = periodos.filter(p => p.data === todayStr);
          if (todayPeriodos.length > 0) {
            const periodoCodigos = new Set(todayPeriodos.map(p => p.codigo));
            const todayEscala = escalas.find(e => periodoCodigos.has(e.periodoCodigo));
            if (todayEscala) {
              const allUsers = deps.userRepository.getAll();
              const user = allUsers.find(u => u.codigo === todayEscala.usuarioCodigo);
              scheduledPlantonista = {
                nome: user ? user.nome : todayEscala.usuarioCodigo,
                usuarioCodigo: todayEscala.usuarioCodigo,
              };
            }
          }
        }

        if (scheduledPlantonista) {
          // There is a scheduled plantonista — no fallback needed
          return {
            ...group,
            onCallStatus: {
              hasScheduledPlantonista: true,
              plantonista: scheduledPlantonista,
              fallback: null,
            },
          };
        }

        // No plantonista scheduled today — resolve fallback (Requirements 5.1, 5.2)
        if (deps.userRepository && deps.areaRepository) {
          const fallback = resolveAreaFallback(group.areaCodigo, deps.userRepository, deps.areaRepository);
          return {
            ...group,
            onCallStatus: {
              hasScheduledPlantonista: false,
              plantonista: null,
              fallback: {
                scope: fallback.fallbackScope,
                torre: fallback.torre,
                contacts: fallback.contacts,
              },
            },
          };
        }

        return {
          ...group,
          onCallStatus: {
            hasScheduledPlantonista: false,
            plantonista: null,
            fallback: null,
          },
        };
      });

      res.json({ groups: groupsWithOnCall, unassigned });
    });
  }

  // === Auth Routes (no authentication required) ===

  if (deps.authService) {
    const authService = deps.authService;

    // POST /api/auth/login — Autenticar usuário e retornar token
    app.post('/api/auth/login', async (req: Request, res: Response) => {
      const { username, senha } = req.body || {};
      if (!username || !senha) {
        res.status(400).json({ error: 'username e senha são obrigatórios' });
        return;
      }
      const result = await authService.login(username, senha);
      if (!result.success) {
        res.status(401).json({ error: result.error });
        return;
      }
      res.json({ token: result.token, user: result.user });
    });

    // POST /api/auth/register — Cadastrar novo usuário
    app.post('/api/auth/register', async (req: Request, res: Response) => {
      const { codigo, areaCodigo, nome, perfil, cargo, username, senha } = req.body || {};
      if (!codigo || !nome || !perfil || !username || !senha) {
        res.status(400).json({ error: 'codigo, nome, perfil, username e senha são obrigatórios' });
        return;
      }

      // Segurança: auto-registro não permite perfil Adm
      if (perfil === 'Adm') {
        res.status(403).json({ error: 'Perfil Adm não permitido no auto-registro. Contate um administrador.' });
        return;
      }

      // Novo usuário vai para área PENDENTE_APROVACAO, guarda a área solicitada
      const result = await authService.register({
        codigo,
        areaCodigo: 'PENDENTE_APROVACAO',
        areaSolicitada: areaCodigo || null,
        nome,
        perfil,
        cargo,
        username,
        senha,
        aprovado: false,
      });
      if (!result.success) {
        res.status(400).json({ error: result.error });
        return;
      }
      res.status(201).json({ user: result.user, message: 'Cadastro realizado! Aguarde aprovação do responsável da área.' });
    });

    // === Protected Routes (require auth middleware) ===
    const authMiddleware = createAuthMiddleware(authService);
    // Create DB-backed area filter middleware if userAreaRepository is available
    const dbAreaFilterMiddleware = deps.userAreaRepository
      ? createAreaFilterMiddleware(deps.userAreaRepository)
      : areaFilterMiddleware;

    // GET /api/auth/me — Retornar dados do usuário logado
    app.get('/api/auth/me', authMiddleware, (req: Request, res: Response) => {
      if (!deps.userRepository) {
        res.status(500).json({ error: 'User repository not available' });
        return;
      }
      const user = deps.userRepository.getById(req.user!.userId);
      if (!user) {
        res.status(404).json({ error: 'Usuário não encontrado' });
        return;
      }
      const { senhaHash, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    });

    // POST /api/auth/select-area — Selecionar área de responsabilidade após login
    app.post('/api/auth/select-area', authMiddleware, (req: Request, res: Response) => {
      const { areaCodigo } = req.body || {};
      if (!areaCodigo) {
        res.status(400).json({ error: 'areaCodigo é obrigatório' });
        return;
      }

      const { perfil, areaCodigo: userArea } = req.user!;

      // Adm can select any area
      if (perfil === 'Adm') {
        res.json({ success: true, selectedArea: areaCodigo });
        return;
      }

      // Responsavel can only select their own area
      if (perfil === 'Responsavel') {
        if (areaCodigo !== userArea) {
          res.status(403).json({ error: 'Você só pode selecionar sua própria área de responsabilidade' });
          return;
        }
        res.json({ success: true, selectedArea: areaCodigo });
        return;
      }

      // Plantonista can only see their own area
      if (perfil === 'Plantonista') {
        if (areaCodigo !== userArea) {
          res.status(403).json({ error: 'Você só pode visualizar sua própria área' });
          return;
        }
        res.json({ success: true, selectedArea: areaCodigo });
        return;
      }

      res.status(403).json({ error: 'Perfil não reconhecido' });
    });

    // GET /api/dashboard/data — Retornar dados filtrados por área selecionada
    app.get('/api/dashboard/data', authMiddleware, dbAreaFilterMiddleware, (req: Request, res: Response) => {
      const areaFilter = getEffectiveAreaFilter(req);

      // Return the effective area filter and user context for the frontend
      res.json({
        selectedArea: areaFilter,
        perfil: req.user!.perfil,
        accessLevel: req.user!.perfil === 'Adm' ? 'full' :
                     req.user!.perfil === 'Responsavel' ? 'area' : 'readonly',
      });
    });

    // === User CRUD Routes ===

    if (deps.userRepository) {
      const userRepository = deps.userRepository;

      // GET /api/users — Listar usuários (admin and responsavel)
      // Suporta ?search= para filtrar por nome ou perfil (case-insensitive)
      // Retorna { users, total } onde total é o número de usuários após filtro
      app.get('/api/users', authMiddleware, roleMiddleware(['Adm', 'Responsavel']), dbAreaFilterMiddleware, (req: Request, res: Response) => {
        let users = userRepository.getAll();
        // Use effective areas for filtering
        const effectiveAreas = getEffectiveAreas(req);
        if (effectiveAreas !== null) {
          users = users.filter(u => u.areaCodigo && effectiveAreas.includes(u.areaCodigo));
        }
        // Apply search filter by nome or perfil (case-insensitive)
        const search = req.query.search as string | undefined;
        if (search && search.trim() !== '') {
          const searchLower = search.trim().toLowerCase();
          users = users.filter(u =>
            u.nome.toLowerCase().includes(searchLower) ||
            u.perfil.toLowerCase().includes(searchLower)
          );
        }
        const usersWithoutPassword = users.map(({ senhaHash, ...u }) => u);
        res.json({ users: usersWithoutPassword, total: usersWithoutPassword.length });
      });

      // POST /api/users — Criar usuário (admin only)
      app.post('/api/users', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), async (req: Request, res: Response) => {
        const { codigo, areaCodigo, nome, perfil, cargo, contato, username, senha } = req.body || {};
        if (!codigo || !nome || !perfil || !username || !senha) {
          res.status(400).json({ error: 'codigo, nome, perfil, username e senha são obrigatórios' });
          return;
        }
        const result = await authService.register({ codigo, areaCodigo, nome, perfil, cargo, contato, username, senha });
        if (!result.success) {
          res.status(400).json({ error: result.error });
          return;
        }
        res.status(201).json({ user: result.user });
      });

      // PUT /api/users/:id — Editar usuário
      app.put('/api/users/:id', authMiddleware, writeBlockMiddleware, (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = userRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Usuário não encontrado' });
          return;
        }
        const { codigo, areaCodigo, nome, perfil, cargo, contato, username, nivelEscalonamento, ativo } = req.body || {};
        const updated = userRepository.update(id, { codigo, areaCodigo, nome, perfil, cargo, contato, username, nivelEscalonamento, ativo });
        if (!updated) {
          res.status(500).json({ error: 'Erro ao atualizar usuário' });
          return;
        }
        const { senhaHash, ...userWithoutPassword } = updated;
        res.json(userWithoutPassword);
      });

      // DELETE /api/users/:id — Deletar usuário (admin only)
      app.delete('/api/users/:id', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = userRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Usuário não encontrado' });
          return;
        }
        userRepository.delete(id);
        res.json({ success: true });
      });

      // POST /api/users/:id/approve — Aprovar plantonista pendente (Responsável/Adm)
      app.post('/api/users/:id/approve', authMiddleware, roleMiddleware(['Adm', 'Responsavel']), (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
        const existing = userRepository.getById(id);
        if (!existing) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
        // Move user from PENDENTE_APROVACAO to their requested area
        const targetArea = existing.areaSolicitada || existing.areaCodigo;
        userRepository.update(id, { aprovado: true, areaCodigo: targetArea, areaSolicitada: null });
        res.json({ success: true, message: 'Plantonista aprovado!' });
      });

      // POST /api/users/:id/reject — Rejeitar plantonista pendente (Responsável/Adm)
      app.post('/api/users/:id/reject', authMiddleware, roleMiddleware(['Adm', 'Responsavel']), (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
        const existing = userRepository.getById(id);
        if (!existing) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
        userRepository.update(id, { ativo: false, aprovado: false });
        res.json({ success: true, message: 'Plantonista rejeitado.' });
      });

      // GET /api/users/pending — Listar plantonistas pendentes de aprovação
      app.get('/api/users/pending', authMiddleware, roleMiddleware(['Adm', 'Responsavel']), (_req: Request, res: Response) => {
        const allUsers = userRepository.getAll();
        const pending = allUsers.filter(u => !u.aprovado && u.ativo);
        const result = pending.map(({ senhaHash, ...u }) => u);
        res.json(result);
      });

      // === User-Area Binding Routes ===

      if (deps.userAreaRepository) {
        const userAreaRepo = deps.userAreaRepository;

        // GET /api/users/:id/areas — List linked areas for a user
        app.get('/api/users/:id/areas', authMiddleware, (req: Request, res: Response) => {
          const id = parseInt(req.params.id as string, 10);
          if (isNaN(id)) {
            res.status(400).json({ error: 'ID inválido' });
            return;
          }
          const existing = userRepository.getById(id);
          if (!existing) {
            res.status(404).json({ error: 'Usuário não encontrado' });
            return;
          }
          const areas = userAreaRepo.getAreasForUser(id);
          res.json(areas);
        });

        // POST /api/users/:id/areas — Add area binding (Admin only)
        app.post('/api/users/:id/areas', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), (req: Request, res: Response) => {
          const id = parseInt(req.params.id as string, 10);
          if (isNaN(id)) {
            res.status(400).json({ error: 'ID inválido' });
            return;
          }
          const existing = userRepository.getById(id);
          if (!existing) {
            res.status(404).json({ error: 'Usuário não encontrado' });
            return;
          }
          const { areaCodigo } = req.body || {};
          if (!areaCodigo) {
            res.status(400).json({ error: 'areaCodigo é obrigatório' });
            return;
          }
          userAreaRepo.addAreaBinding(id, areaCodigo);
          res.status(201).json({ success: true, userId: id, areaCodigo });
        });

        // DELETE /api/users/:id/areas/:areaCodigo — Remove area binding (Admin only)
        app.delete('/api/users/:id/areas/:areaCodigo', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), (req: Request, res: Response) => {
          const id = parseInt(req.params.id as string, 10);
          if (isNaN(id)) {
            res.status(400).json({ error: 'ID inválido' });
            return;
          }
          const existing = userRepository.getById(id);
          if (!existing) {
            res.status(404).json({ error: 'Usuário não encontrado' });
            return;
          }
          const areaCodigo = req.params.areaCodigo as string;
          userAreaRepo.removeAreaBinding(id, areaCodigo);
          res.json({ success: true });
        });
      }
    }

    // === Area CRUD Routes ===

    if (deps.areaRepository) {
      const areaRepository = deps.areaRepository;

      // GET /api/areas — Listar áreas cadastradas
      app.get('/api/areas', authMiddleware, dbAreaFilterMiddleware, (req: Request, res: Response) => {
        const effectiveAreas = getEffectiveAreas(req);
        let areas = areaRepository.getAll();
        if (effectiveAreas !== null) {
          areas = areas.filter(a => effectiveAreas.includes(a.codigo));
        }
        res.json(areas);
      });

      // POST /api/areas — Criar nova área (admin only)
      app.post('/api/areas', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), (req: Request, res: Response) => {
        const { codigo, nome, torre, coordenadorNome, coordenadorContato, gerenteNome, gerenteContato } = req.body || {};
        if (!codigo || !nome) {
          res.status(400).json({ error: 'codigo e nome são obrigatórios' });
          return;
        }
        const area = areaRepository.create({ codigo, nome, torre: torre || null, coordenadorNome: coordenadorNome || null, coordenadorContato: coordenadorContato || null, gerenteNome: gerenteNome || null, gerenteContato: gerenteContato || null });
        res.status(201).json(area);
      });

      // PUT /api/areas/:id — Editar área
      app.put('/api/areas/:id', authMiddleware, writeBlockMiddleware, (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = areaRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Área não encontrada' });
          return;
        }
        const { codigo, nome, torre, coordenadorNome, coordenadorContato, gerenteNome, gerenteContato } = req.body || {};
        const updated = areaRepository.update(id, { codigo, nome, torre, coordenadorNome, coordenadorContato, gerenteNome, gerenteContato });
        res.json(updated);
      });

      // DELETE /api/areas/:id — Deletar área (admin only)
      app.delete('/api/areas/:id', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = areaRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Área não encontrada' });
          return;
        }
        areaRepository.delete(id);
        res.json({ success: true });
      });

      // === Area Escalation Chain Routes ===

      if (deps.areaEscalationChainRepository) {
        const areaEscalationChainRepo = deps.areaEscalationChainRepository;

        // GET /api/areas/:codigo/escalation-chain — Get escalation chain for an area
        app.get('/api/areas/:codigo/escalation-chain', authMiddleware, (req: Request, res: Response) => {
          const codigo = req.params.codigo as string;
          const area = areaRepository.getByCodigo(codigo);
          if (!area) {
            res.status(404).json({ error: 'Área não encontrada' });
            return;
          }
          const chain = areaEscalationChainRepo.getByArea(codigo);
          res.json(chain);
        });

        // PUT /api/areas/:codigo/escalation-chain — Save escalation chain for an area
        app.put('/api/areas/:codigo/escalation-chain', authMiddleware, writeBlockMiddleware, (req: Request, res: Response) => {
          const codigo = req.params.codigo as string;
          const area = areaRepository.getByCodigo(codigo);
          if (!area) {
            res.status(404).json({ error: 'Área não encontrada' });
            return;
          }
          const { chain } = req.body || {};
          if (!Array.isArray(chain)) {
            res.status(400).json({ error: 'Body deve conter um array "chain" de membros da cadeia de escalação' });
            return;
          }
          areaEscalationChainRepo.replaceChain(codigo, chain);
          res.json({ success: true });
        });
      }

      // GET /api/areas/:codigo/users — Get all users in an area
      app.get('/api/areas/:codigo/users', authMiddleware, (req: Request, res: Response) => {
        const codigo = req.params.codigo as string;
        const area = areaRepository.getByCodigo(codigo);
        if (!area) {
          res.status(404).json({ error: 'Área não encontrada' });
          return;
        }
        if (deps.userRepository) {
          const users = deps.userRepository.getByArea(codigo);
          const usersWithoutPassword = users.map(({ senhaHash, ...u }) => u);
          res.json(usersWithoutPassword);
        } else {
          res.json([]);
        }
      });
    }

    // === Periodo CRUD Routes ===

    if (deps.periodoRepository) {
      const periodoRepository = deps.periodoRepository;

      // GET /api/periodos/calendar — Calendar data with day-by-day assignment status
      app.get('/api/periodos/calendar', authMiddleware, dbAreaFilterMiddleware, (req: Request, res: Response) => {
        const areaCodigo = req.query.areaCodigo as string | undefined;
        const monthParam = req.query.month as string | undefined;
        const yearParam = req.query.year as string | undefined;

        if (!areaCodigo) {
          res.status(400).json({ error: 'areaCodigo é obrigatório' });
          return;
        }

        // Validate area access
        const effectiveAreas = getEffectiveAreas(req);
        if (effectiveAreas !== null && !effectiveAreas.includes(areaCodigo)) {
          res.status(403).json({ error: 'Acesso restrito à sua área de responsabilidade' });
          return;
        }

        // Use current month/year if not provided
        const now = new Date();
        const month = monthParam ? parseInt(monthParam, 10) : now.getMonth() + 1;
        const year = yearParam ? parseInt(yearParam, 10) : now.getFullYear();

        if (isNaN(month) || month < 1 || month > 12 || isNaN(year)) {
          res.status(400).json({ error: 'Mês ou ano inválido' });
          return;
        }

        // Get all periodos for this area
        const periodos = periodoRepository.getByArea(areaCodigo);

        // Build a map of date -> periodo info
        const daysInMonth = new Date(year, month, 0).getDate();
        const days: Array<{ date: string; hasAssignment: boolean; plantonista?: string; horarios?: string }> = [];

        // Get escalas for this area (if escalaRepository is available)
        const escalaRepo = deps.escalaRepository;
        const userRepo = deps.userRepository;
        const allEscalas = escalaRepo ? escalaRepo.getByArea(areaCodigo) : [];

        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

          // Find periodos matching this date
          const matchingPeriodos = periodos.filter(p => p.data === dateStr);

          if (matchingPeriodos.length > 0) {
            // Find escalas linked to these periodos
            const periodoCodigos = matchingPeriodos.map(p => p.codigo);
            const matchingEscalas = allEscalas.filter(e => periodoCodigos.includes(e.periodoCodigo));

            if (matchingEscalas.length > 0 && userRepo) {
              // Get the plantonista name from the first matching escala
              const firstEscala = matchingEscalas[0];
              const allUsers = userRepo.getAll();
              const assignedUser = allUsers.find(u => u.codigo === firstEscala.usuarioCodigo);
              days.push({
                date: dateStr,
                hasAssignment: true,
                plantonista: assignedUser ? assignedUser.nome : firstEscala.usuarioCodigo,
                horarios: matchingPeriodos[0].horarios,
              });
            } else {
              // Periodo exists but no escala assignment
              days.push({
                date: dateStr,
                hasAssignment: false,
                horarios: matchingPeriodos[0].horarios,
              });
            }
          } else {
            days.push({
              date: dateStr,
              hasAssignment: false,
            });
          }
        }

        // Calculate coverage stats (Requirements 10.2, 10.4)
        const totalDays = daysInMonth;
        const filledDays = days.filter(d => d.hasAssignment).length;
        const missingDays = totalDays - filledDays;
        const coveragePercentage = totalDays > 0 ? Math.round((filledDays / totalDays) * 100 * 100) / 100 : 0;

        res.json({ days, filledDays, missingDays, totalDays, coveragePercentage });
      });

      // GET /api/periodos — Listar períodos (opcionalmente por área, filtrado por perfil)
      app.get('/api/periodos', authMiddleware, dbAreaFilterMiddleware, (req: Request, res: Response) => {
        const areaCodigo = req.query.areaCodigo as string | undefined;
        const effectiveAreas = getEffectiveAreas(req);

        if (areaCodigo) {
          // If user specifies area filter, validate against their access
          if (effectiveAreas !== null && !effectiveAreas.includes(areaCodigo)) {
            res.status(403).json({ error: 'Acesso restrito à sua área de responsabilidade' });
            return;
          }
          const periodos = periodoRepository.getByArea(areaCodigo);
          res.json(periodos);
        } else if (effectiveAreas !== null) {
          // Non-admin users or Responsável get filtered by their areas
          const allPeriodos = effectiveAreas.flatMap(area => periodoRepository.getByArea(area));
          res.json(allPeriodos);
        } else {
          const periodos = periodoRepository.getAll();
          res.json(periodos);
        }
      });

      // POST /api/periodos — Criar período
      app.post('/api/periodos', authMiddleware, writeBlockMiddleware, (req: Request, res: Response) => {
        const { codigo, data, horarios, areaCodigo } = req.body || {};
        if (!data || !horarios || !areaCodigo) {
          res.status(400).json({ error: 'data, horarios e areaCodigo são obrigatórios' });
          return;
        }
        // Auto-generate code if not provided (backwards compatible)
        const finalCodigo = codigo || periodoRepository.generateCode(areaCodigo, data);
        const periodo = periodoRepository.create({ codigo: finalCodigo, data, horarios, areaCodigo });
        res.status(201).json(periodo);
      });

      // PUT /api/periodos/:id — Editar período
      app.put('/api/periodos/:id', authMiddleware, writeBlockMiddleware, (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = periodoRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Período não encontrado' });
          return;
        }
        const { codigo, data, horarios, areaCodigo } = req.body || {};
        const updated = periodoRepository.update(id, { codigo, data, horarios, areaCodigo });
        res.json(updated);
      });

      // DELETE /api/periodos/:id — Deletar período
      app.delete('/api/periodos/:id', authMiddleware, writeBlockMiddleware, (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = periodoRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Período não encontrado' });
          return;
        }
        periodoRepository.deleteById(id);
        res.status(204).send();
      });
    }

    // === Escala CRUD Routes ===

    if (deps.escalaRepository) {
      const escalaRepository = deps.escalaRepository;

      // GET /api/escalas — Listar escalas (opcionalmente por área, filtrado por perfil)
      app.get('/api/escalas', authMiddleware, dbAreaFilterMiddleware, (req: Request, res: Response) => {
        const areaCodigo = req.query.areaCodigo as string | undefined;
        const effectiveAreas = getEffectiveAreas(req);

        if (areaCodigo) {
          // If user specifies area filter, validate against their access
          if (effectiveAreas !== null && !effectiveAreas.includes(areaCodigo)) {
            res.status(403).json({ error: 'Acesso restrito à sua área de responsabilidade' });
            return;
          }
          const escalas = escalaRepository.getByArea(areaCodigo);
          res.json(escalas);
        } else if (effectiveAreas !== null) {
          // Non-admin users or Responsável get filtered by their areas
          const allEscalas = effectiveAreas.flatMap(area => escalaRepository.getByArea(area));
          res.json(allEscalas);
        } else {
          const escalas = escalaRepository.getAll();
          res.json(escalas);
        }
      });

      // POST /api/escalas — Criar escala (vincular área + período + plantonista)
      app.post('/api/escalas', authMiddleware, writeBlockMiddleware, (req: Request, res: Response) => {
        const { codigo, areaCodigo, periodoCodigo, usuarioCodigo } = req.body || {};
        if (!codigo || !areaCodigo || !periodoCodigo || !usuarioCodigo) {
          res.status(400).json({ error: 'codigo, areaCodigo, periodoCodigo e usuarioCodigo são obrigatórios' });
          return;
        }
        const escala = escalaRepository.create({ codigo, areaCodigo, periodoCodigo, usuarioCodigo });
        res.status(201).json(escala);
      });

      // PUT /api/escalas/:id — Editar escala
      app.put('/api/escalas/:id', authMiddleware, writeBlockMiddleware, (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = escalaRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Escala não encontrada' });
          return;
        }
        const { codigo, areaCodigo, periodoCodigo, usuarioCodigo } = req.body || {};
        const updated = escalaRepository.update(id, { codigo, areaCodigo, periodoCodigo, usuarioCodigo });
        res.json(updated);
      });

      // DELETE /api/escalas/:id — Deletar escala
      app.delete('/api/escalas/:id', authMiddleware, writeBlockMiddleware, (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = escalaRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Escala não encontrada' });
          return;
        }
        escalaRepository.delete(id);
        res.json({ success: true });
      });
    }
  }

  // === Problema CRUD Routes ===

  if (deps.problemaRepository) {
    const problemaRepo = deps.problemaRepository;

    // GET /api/problemas — Listar problemas com áreas
    app.get('/api/problemas', (_req: Request, res: Response) => {
      const problemas = problemaRepo.getAllWithAreas();
      res.json(problemas);
    });

    // GET /api/problemas/:id — Detalhes de um problema
    app.get('/api/problemas/:id', (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const problema = problemaRepo.getById(id);
      if (!problema) { res.status(404).json({ error: 'Problema não encontrado' }); return; }
      const areas = problemaRepo.getAreas(id);
      res.json({ ...problema, areas });
    });

    // POST /api/problemas — Criar problema
    app.post('/api/problemas', (req: Request, res: Response) => {
      const { codigo, descricao, areas } = req.body || {};
      if (!codigo || !descricao) {
        res.status(400).json({ error: 'codigo e descricao são obrigatórios' });
        return;
      }
      // Check unique codigo
      if (problemaRepo.getByCodigo(codigo)) {
        res.status(400).json({ error: 'Código já existe' });
        return;
      }
      const problema = problemaRepo.create({ codigo, descricao });
      // Add areas if provided
      if (Array.isArray(areas) && areas.length > 0) {
        problemaRepo.replaceAreas(problema.id, areas);
      }
      const result = { ...problema, areas: problemaRepo.getAreas(problema.id) };
      res.status(201).json(result);
    });

    // PUT /api/problemas/:id — Editar problema
    app.put('/api/problemas/:id', (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const existing = problemaRepo.getById(id);
      if (!existing) { res.status(404).json({ error: 'Problema não encontrado' }); return; }
      const { codigo, descricao, areas } = req.body || {};
      const updated = problemaRepo.update(id, { codigo, descricao });
      if (Array.isArray(areas)) {
        problemaRepo.replaceAreas(id, areas);
      }
      const result = { ...updated, areas: problemaRepo.getAreas(id) };
      res.json(result);
    });

    // DELETE /api/problemas/:id — Deletar problema
    app.delete('/api/problemas/:id', (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const existing = problemaRepo.getById(id);
      if (!existing) { res.status(404).json({ error: 'Problema não encontrado' }); return; }
      problemaRepo.delete(id);
      res.json({ success: true });
    });

    // PUT /api/problemas/:id/areas — Salvar grid de áreas do problema
    app.put('/api/problemas/:id/areas', (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const existing = problemaRepo.getById(id);
      if (!existing) { res.status(404).json({ error: 'Problema não encontrado' }); return; }
      const { areas } = req.body || {};
      if (!Array.isArray(areas)) {
        res.status(400).json({ error: 'Body deve conter array "areas" com { areaCodigo, ordem }' });
        return;
      }
      problemaRepo.replaceAreas(id, areas);
      const result = problemaRepo.getAreas(id);
      res.json(result);
    });
  }

  // === User Permissions Routes ===

  if (deps.userPermissionRepository) {
    const permRepo = deps.userPermissionRepository;

    // GET /api/users/:id/permissions — Get permissions for a user
    app.get('/api/users/:id/permissions', (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const perms = permRepo.getByUser(id);
      res.json(perms);
    });

    // PUT /api/users/:id/permissions — Replace all permissions for a user
    app.put('/api/users/:id/permissions', (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const { permissions } = req.body || {};
      if (!Array.isArray(permissions)) {
        res.status(400).json({ error: 'Body deve conter array "permissions"' });
        return;
      }
      permRepo.replacePermissions(id, permissions);
      res.json(permRepo.getByUser(id));
    });
  }

  // === Contato Log Routes (status de acionamento) ===

  // POST /api/contato-log — Registrar status de contato com plantonista
  app.post('/api/contato-log', (req: Request, res: Response) => {
    const { plantonista, areaCodigo, problemaCodigo, data, status, observacao } = req.body || {};
    if (!plantonista || !areaCodigo || !data || !status) {
      res.status(400).json({ error: 'plantonista, areaCodigo, data e status são obrigatórios' });
      return;
    }
    if (!['pendente', 'atendido', 'nao_atendido'].includes(status)) {
      res.status(400).json({ error: 'status deve ser: pendente, atendido ou nao_atendido' });
      return;
    }
    // Hora atual em Brasília
    const now = new Date();
    const hora = now.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });

    if (deps.db) {
      try {
        deps.db.prepare(`
          INSERT INTO contato_log (plantonista, area_codigo, problema_codigo, data, hora, status, registrado_por, observacao)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(plantonista, areaCodigo, problemaCodigo || null, data, hora, status, req.user?.username || 'sistema', observacao || null);
      } catch { /* table might not exist yet */ }
    }
    res.json({ success: true, hora });
  });

  // GET /api/contato-log — Listar logs de contato (para relatório)
  app.get('/api/contato-log', (req: Request, res: Response) => {
    if (!deps.db) { res.json([]); return; }
    const dataFilter = req.query.data as string | undefined;
    const areaFilter = req.query.areaCodigo as string | undefined;
    try {
      let sql = 'SELECT * FROM contato_log WHERE 1=1';
      const params: any[] = [];
      if (dataFilter) { sql += ' AND data = ?'; params.push(dataFilter); }
      if (areaFilter) { sql += ' AND area_codigo = ?'; params.push(areaFilter); }
      sql += ' ORDER BY data DESC, hora DESC LIMIT 500';
      const rows = deps.db.prepare(sql).all(...params);
      res.json(rows);
    } catch { res.json([]); }
  });

  return app;
}
