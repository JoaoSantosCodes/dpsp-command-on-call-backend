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
import { parseEscalationCSV, getCurrentOnCallForArea, EscalationEntry, isReadableText } from './services/escalation-csv-processor';
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
  
  // Confiar no proxy do Render/Vercel para que o express-rate-limit não bloqueie as requisições
  app.set('trust proxy', 1);

  // CORS — permite origens configuradas
  const allowedOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map(s => s.trim())
    : ['http://localhost:5173', 'http://localhost:3000'];

  app.use(cors({
    origin: (origin, callback) => {
      // Permitir requisições sem origin (como ferramentas locais/Postman)
      if (!origin) return callback(null, true);
      
      // Permitir automaticamente qualquer URL da Vercel (incluindo previews)
      if (origin.endsWith('.vercel.app')) {
        return callback(null, true);
      }
      
      if (allowedOrigins.indexOf(origin) !== -1) {
        return callback(null, true);
      }
      
      console.warn(`[CORS] Origem bloqueada: ${origin}`);
      return callback(new Error('Bloqueado pela política de CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
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
    deps.db.query('SELECT * FROM escalation_schedules').then((res: any) => {
      escalationEntries = res.rows.map((r: any) => ({
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
    }).catch(() => { /* table might not exist yet */ });
  }

  // POST /api/admin/cleanup-corrupted — Remove dados corrompidos (endpoint emergencial, remover após uso)
  app.post('/api/admin/cleanup-corrupted', (_req: Request, res: Response) => {
    // ... [código anterior]
    res.json({ success: true });
  });

  // GET /api/admin/reset-escalation — Wipes all escalation data (emergency reset)
  app.get('/api/admin/reset-escalation', async (_req: Request, res: Response) => {
    if (deps.db) {
      try {
        await deps.db.query('DELETE FROM escalation_schedules');
        await deps.db.query('DELETE FROM escalas');
        await deps.db.query('DELETE FROM periodos');
      } catch (e) {
        console.error('[Admin] Erro ao limpar tabelas:', e);
      }
    }
    escalationEntries = [];
    res.json({ success: true, message: 'Todos os plantões e áreas foram limpos do banco de dados! Volte e importe o CSV novamente.' });
  });

  // GET /api/admin/seed-admin - Recreate default admin user
  app.get('/api/admin/seed-admin', async (_req: Request, res: Response) => {
    try {
      const existing = await deps.userRepository?.getByUsername('admin');
      if (existing) {
        res.json({ success: true, message: 'Usuário admin já existe. Tente logar com ele.' });
        return;
      }
      if (!deps.authService) {
        res.status(500).json({ error: 'AuthService não disponível' });
        return;
      }
      const result = await deps.authService.register({
        codigo: 'ADM-001',
        areaCodigo: null,
        nome: 'Administrador',
        perfil: 'Adm',
        cargo: 'Administrador do Sistema',
        contato: '',
        username: 'admin',
        senha: '123'
      });
      if (result.success) {
        // Aprove immediately
        if (result.user) await deps.userRepository?.update(result.user.id, { aprovado: true });
        res.json({ success: true, message: 'Usuário admin recriado com sucesso! Login: admin | Senha: 123' });
      } else {
        res.status(500).json({ error: result.error });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // GET /api/admin/seed-leaders — Auto-populate coordinators and managers
  app.get('/api/admin/seed-leaders', async (_req: Request, res: Response) => {
    if (deps.areaRepository) {
      const updates = [
        { regex: /Lojas/i, coord: 'Yuri Marques', coordContato: '(19) 96444-428', ger: 'William Mendonça', gerContato: '(11) 94554-4585' },
        { regex: /Digitais/i, coord: 'Moyses Santos', coordContato: '(11) 94535-4913', ger: null, gerContato: null },
        { regex: /Log[ií]stica/i, coord: 'Alessandro Lucas Soares', coordContato: '(11) 97208-7822', ger: 'Fabricio Spano', gerContato: '(11) 97208-7822' },
        { regex: /Comercial|Marketing/i, coord: 'Priscila Lira Alves', coordContato: '(11) 97355-7180', ger: null, gerContato: null },
        { regex: /Corporativa/i, coord: 'Marcelo Almeida / Thiago Moreira', coordContato: '(11) 94546-0472', ger: 'William Mendonça', gerContato: '(11) 94554-4585' },
        { regex: /Sa[úu]de/i, coord: 'Victor Hideo Nagatani', coordContato: '(11) 91033-0161', ger: null, gerContato: null },
        { regex: /Integra[çc][õo]es|CPI|ODI/i, coord: 'Tarciso Franzote Perozini', coordContato: '', ger: null, gerContato: null },
        { regex: /Infraestrutura|Data Center/i, coord: 'Andrie Ferreira Bittencourt', coordContato: '(11) 96392-0260', ger: 'Alex Almeida', gerContato: '(11) 99693-6308' },
        { regex: /Redes/i, coord: 'Mauricio Santos Pomponet', coordContato: '(11) 94195-7625', ger: 'Marcos Marra Boldori', gerContato: '(11) 93259-6134' },
        { regex: /DevOps|Cloud|TIME CLOUD/i, coord: 'Jair Meira Nascimento', coordContato: '(11) 99741-1892', ger: 'Alex Almeida', gerContato: '(11) 99693-6308' },
        { regex: /Command Center/i, coord: 'Diego Carmo', coordContato: '(11) 94333-4500', ger: 'Alexandre Carvalho de Lima', gerContato: '(11) 98965-2816' },
      ];

      const areas = await deps.areaRepository.getAll();
      let updatedCount = 0;
      for (const area of areas) {
        for (const u of updates) {
          if (u.regex.test(area.nome) || u.regex.test(area.codigo)) {
            await deps.areaRepository.update(area.id, {
              coordenadorNome: u.coord || area.coordenadorNome,
              coordenadorContato: u.coordContato || area.coordenadorContato,
              gerenteNome: u.ger || area.gerenteNome,
              gerenteContato: u.gerContato || area.gerenteContato,
            });
            updatedCount++;
            break;
          }
        }
      }
      res.json({ success: true, message: `Líderes atualizados em ${updatedCount} áreas com sucesso! Atualize a página.` });
    } else {
      res.status(500).json({ error: 'Area repository not available' });
    }
  });

  // GET /api/status — Status de conexão com Datadog
  app.get('/api/status', (_req: Request, res: Response) => {
    const isRunning = deps.datadogPollingService.isRunning;
    res.json({
      datadog: isRunning ? 'connected' : 'disconnected',
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/monitors — Listar monitores com estado
  app.get('/api/monitors', async (_req: Request, res: Response) => {
    let monitors = deps.datadogPollingService.getMonitors();
    
    // Fallback: if no monitors from Datadog polling, load from DB (mock/seeded data)
    if ((!monitors || monitors.length === 0) && deps.db) {
      try {
        const dbMonitors = (await deps.db.query('SELECT id, name, state, tags, priority, area_codigo FROM monitors')).rows as any[];
        if (dbMonitors.length > 0) {
          monitors = dbMonitors.map((m: any) => ({
            id: m.id,
            name: m.name,
            state: m.state || 'OK',
            tags: m.tags ? m.tags.split(',').map((t: string) => t.trim()) : [],
            priority: m.priority || 'P1',
            areaCodigo: m.area_codigo,
            teamId: m.area_codigo || '',
            lastUpdated: new Date(),
          }));
        }
      } catch { /* table may not exist */ }
    }
    
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
    app.get('/api/areas/public', async (_req: Request, res: Response) => {
      const areas = await deps.areaRepository!.getAll();
      res.json(areas);
    });
  }

  // GET /api/teams — Listar times com plantonista atual
  app.get('/api/teams', async (_req: Request, res: Response) => {
    const teams = await deps.teamRepository.getAll();
    const result = await Promise.all(teams.map(async (team) => {
      const currentOnCall = await deps.scheduleManager.getCurrentOnCall(team.id);
      const escalationChain = await deps.scheduleManager.getEscalationChain(team.id);
      return {
        teamId: team.id,
        teamName: team.name,
        displayOrder: team.displayOrder,
        currentOnCall,
        escalationChainConfigured: escalationChain.length > 0,
      };
    }));
    res.json(result);
  });

  // POST /api/teams — Criar novo time
  app.post('/api/teams', async (req: Request, res: Response) => {
    const { id, name, displayOrder } = req.body || {};
    if (!id || !name) {
      res.status(400).json({ error: 'id e name são obrigatórios' });
      return;
    }
    if (await deps.teamRepository.exists(id)) {
      res.status(400).json({ error: 'Time com este ID já existe' });
      return;
    }
    const team = await deps.teamRepository.create({ id, name, displayOrder: displayOrder || 99 });
    res.status(201).json(team);
  });

  // PUT /api/teams/:id — Atualizar time
  app.put('/api/teams/:id', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const team = await deps.teamRepository.getById(id);
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    const { name, displayOrder } = req.body || {};
    const updated = await deps.teamRepository.update(id, { name, displayOrder });
    res.json(updated);
  });

  // DELETE /api/teams/:id — Deletar time
  app.delete('/api/teams/:id', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const team = await deps.teamRepository.getById(id);
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    await deps.teamRepository.delete(id);
    res.json({ success: true });
  });

  // GET /api/teams/:id/escalation-chain — Cadeia de escalação
  app.get('/api/teams/:id/escalation-chain', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const team = await deps.teamRepository.getById(id);
    if (!team) {
      res.status(404).json({ error: 'Time não encontrado' });
      return;
    }
    const chain = await deps.scheduleManager.getEscalationChain(id);
    res.json(chain);
  });

  // PUT /api/teams/:id/escalation-chain — Atualizar cadeia de escalação
  app.put('/api/teams/:id/escalation-chain', async (req: Request, res: Response) => {
    const id = req.params.id as string;
    const team = await deps.teamRepository.getById(id);
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
        const allUsers = await deps.userRepository.getAll();
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

    await deps.scheduleManager.updateEscalationChain(id, finalChain);
    res.json({ success: true });
  });

  // POST /api/schedules/import — Importar CSV (multipart/form-data)
  app.post('/api/schedules/import', upload.single('file'), async (req: Request, res: Response) => {
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

    const importResult = await deps.csvProcessor.importSchedule(validationResult.validEntries);
    res.json(importResult);
  });

  // POST /api/escalation/import — Importar CSV/XLSX de escalonamento (formato área → colaboradores → dias)
  app.post('/api/escalation/import', upload.single('file'), async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({ error: 'Nenhum arquivo enviado' });
      return;
    }

    const now = new Date();
    const brasiliaStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
    const brasiliaDate = new Date(brasiliaStr);
    
    // Get month/year from request body, fallback to current date
    const importMonth = req.body.mes ? parseInt(req.body.mes, 10) : brasiliaDate.getMonth() + 1;
    const importYear = req.body.ano ? parseInt(req.body.ano, 10) : brasiliaDate.getFullYear();

    let csvContent: string;
    const buffer = req.file.buffer;
    const fileName = (req.file.originalname || '').toLowerCase();

    // If XLSX/XLS file, convert to CSV first
    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      try {
        const XLSX = require('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        
        // Process all sheets — each sheet may represent a different area
        const allResults: { csv: string; sheetName: string }[] = [];
        const skipSheets = ['instruções', 'instrucoes', 'instructions', 'template vazio', 'readme'];
        for (const sheetName of workbook.SheetNames) {
          // Skip instruction/template sheets
          if (skipSheets.some(s => sheetName.toLowerCase().includes(s))) continue;
          const sheet = workbook.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
          allResults.push({ csv, sheetName });
        }

        if (allResults.length === 1) {
          csvContent = allResults[0].csv;
          
          // Validate that CSV content is readable (not binary garbage from encrypted file)
          if (!isReadableText(csvContent.substring(0, 500))) {
            res.status(400).json({ error: 'Arquivo parece estar criptografado ou corrompido. Remova a proteção por senha antes de importar.' });
            return;
          }
          // Parse with sheet name for tabular format support
          const singleResult = parseEscalationCSV(csvContent, allResults[0].sheetName);
          if (singleResult.entries.length > 0) {
            // Use singleResult directly — skip normal parsing below
            const resultData = singleResult;
            
            // Store in memory for on-call lookups
            escalationEntries = resultData.entries;

            // Persist to database
            if (deps.db) {
              await deps.db.query('BEGIN');
              try {
                await deps.db.query('DELETE FROM escalation_schedules WHERE mes = $1 AND ano = $2', [importMonth, importYear]);
                const insertSql = 'INSERT INTO escalation_schedules (area, colaborador, cargo, nivel, contato, dia, mes, ano, horario_inicio, horario_fim, is_24h) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)';
                for (const entry of resultData.entries) {
                  await deps.db.query(insertSql, [entry.area, entry.colaborador, entry.cargo, entry.nivel, entry.contato, entry.dia, importMonth, importYear, entry.horarioInicio, entry.horarioFim, entry.is24h ? 1 : 0]);
                }
                await deps.db.query('COMMIT');
              } catch (e) {
                await deps.db.query('ROLLBACK');
                console.error('Import transaction error', e);
              }
            }

            // Auto-create areas/users (same logic as below)
            let areasCreated = 0;
            let usersCreated = 0;
            let usersUpdated = 0;

            if (deps.areaRepository && deps.userRepository) {
              const areaRepo = deps.areaRepository;
              const userRepo = deps.userRepository;
              const bcrypt = require('bcrypt');

              for (const parsedArea of resultData.areas) {
                const allAreas = await areaRepo.getAll();
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
                    await areaRepo.create({ codigo: areaCodigo, nome: parsedArea.area, torre: null, coordenadorNome: null, coordenadorContato: null, gerenteNome: null, gerenteContato: null });
                    areasCreated++;
                  } catch { /* skip */ }
                }

                for (const colab of parsedArea.colaboradores) {
                  if (!colab.nome || colab.nome === 'xxxxx' || !isReadableText(colab.nome)) continue;
                  const username = colab.nome.toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '').substring(0, 30);

                  const existing = await userRepo.getByUsername(username);
                  if (existing) {
                    const updates: any = {};
                    if (areaCodigo && existing.areaCodigo !== areaCodigo) updates.areaCodigo = areaCodigo;
                    if (colab.cargo && existing.cargo !== colab.cargo) updates.cargo = colab.cargo;
                    if (colab.contato && existing.contato !== colab.contato) updates.contato = colab.contato;
                    if (Object.keys(updates).length > 0) {
                      try { await userRepo.update(existing.id, updates); usersUpdated++; } catch { /* skip */ }
                    }
                  } else {
                    const codigo = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                    const senhaHash = bcrypt.hashSync('plantonista123', 10);
                    try {
                      await userRepo.create({ codigo, areaCodigo, areaSolicitada: null, nome: colab.nome, perfil: 'Plantonista', nivelEscalonamento: null, cargo: colab.cargo || null, contato: colab.contato || null, username, senhaHash, ativo: true, aprovado: true });
                      usersCreated++;
                    } catch { /* skip */ }
                  }
                }
              }
            }

            // Auto-create Periodos + Escalas
            let periodosCreated = 0;
            let escalasCreated = 0;

            if (deps.periodoRepository && deps.escalaRepository && deps.areaRepository && deps.userRepository) {
              const periodoRepo = deps.periodoRepository;
              const escalaRepo = deps.escalaRepository;
              const areaRepo = deps.areaRepository;
              const userRepo = deps.userRepository;

              for (const entry of resultData.entries) {
                const allAreas = await areaRepo.getAll();
                const areaNorm = normalizeForComparison(entry.area);
                const matchedArea = allAreas.find(a => normalizeForComparison(a.nome) === areaNorm || normalizeForComparison(a.codigo) === areaNorm);
                if (!matchedArea) continue;

                const areaCodigo = matchedArea.codigo;
                const dateStr = `${importYear}-${String(importMonth).padStart(2, '0')}-${String(entry.dia).padStart(2, '0')}`;
                const horarios = entry.is24h ? '24hs' : `${entry.horarioInicio} às ${entry.horarioFim}`;

                const existingPeriodos = await periodoRepo.getByArea(areaCodigo);
                let periodo = existingPeriodos.find((p: any) => p.data === dateStr && p.horarios === horarios);
                if (!periodo) {
                  const periodoCodigo = `PER-${areaCodigo.substring(0, 10)}-${dateStr}-${Math.random().toString(36).substring(2, 5)}`;
                  try { periodo = await periodoRepo.create({ codigo: periodoCodigo, data: dateStr, horarios, areaCodigo }); periodosCreated++; } catch { continue; }
                }

                const userNorm = normalizeForComparison(entry.colaborador);
                const allUsers = await userRepo.getAll();
                const matchedUser = allUsers.find((u: any) => normalizeForComparison(u.nome) === userNorm && u.areaCodigo === areaCodigo);
                if (!matchedUser) continue;

                const existingEscalas = await escalaRepo.getByArea(areaCodigo);
                const alreadyExists = existingEscalas.some((e: any) => e.periodoCodigo === periodo.codigo && e.usuarioCodigo === matchedUser.codigo);
                if (alreadyExists) continue;

                const escalaCodigo = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                try { await escalaRepo.create({ codigo: escalaCodigo, areaCodigo, periodoCodigo: periodo.codigo, usuarioCodigo: matchedUser.codigo }); escalasCreated++; } catch { /* skip */ }
              }
            }

            res.json({
              success: true,
              areas: resultData.areas.map(a => ({ nome: a.area, colaboradores: a.colaboradores.length })),
              totalEntries: resultData.entries.length,
              areasCreated,
              usersCreated,
              usersUpdated,
              periodosCreated,
              escalasCreated,
              errors: resultData.errors,
            });
            return;
          }
        } else {
          // Multiple sheets: combine results from all sheets
          const combinedResult: { areas: any[]; entries: any[]; errors: string[] } = { areas: [], entries: [], errors: [] };
          for (const { csv, sheetName } of allResults) {
            const sheetResult = parseEscalationCSV(csv, sheetName);
            combinedResult.areas.push(...sheetResult.areas);
            combinedResult.entries.push(...sheetResult.entries);
            combinedResult.errors.push(...sheetResult.errors);
          }

          if (combinedResult.entries.length > 0) {
            // Store in memory
            escalationEntries = combinedResult.entries;

            if (deps.db) {
              await deps.db.query('BEGIN');
              try {
                await deps.db.query('DELETE FROM escalation_schedules WHERE mes = $1 AND ano = $2', [importMonth, importYear]);
                const insertSql = 'INSERT INTO escalation_schedules (area, colaborador, cargo, nivel, contato, dia, mes, ano, horario_inicio, horario_fim, is_24h) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)';
                for (const entry of combinedResult.entries) {
                  await deps.db.query(insertSql, [entry.area, entry.colaborador, entry.cargo, entry.nivel, entry.contato, entry.dia, importMonth, importYear, entry.horarioInicio, entry.horarioFim, entry.is24h ? 1 : 0]);
                }
                await deps.db.query('COMMIT');
              } catch (e) {
                await deps.db.query('ROLLBACK');
                console.error('Import transaction error', e);
              }
            }

            // Auto-create areas/users
            let areasCreated = 0;
            let usersCreated = 0;
            let usersUpdated = 0;

            if (deps.areaRepository && deps.userRepository) {
              const areaRepo = deps.areaRepository;
              const userRepo = deps.userRepository;
              const bcrypt = require('bcrypt');

              for (const parsedArea of combinedResult.areas) {
                const allAreas = await areaRepo.getAll();
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
                    await areaRepo.create({ codigo: areaCodigo, nome: parsedArea.area, torre: null, coordenadorNome: null, coordenadorContato: null, gerenteNome: null, gerenteContato: null });
                    areasCreated++;
                  } catch { /* skip */ }
                }

                for (const colab of parsedArea.colaboradores) {
                  if (!colab.nome || colab.nome === 'xxxxx' || !isReadableText(colab.nome)) continue;
                  const username = colab.nome.toLowerCase()
                    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
                    .replace(/[^a-z0-9]/g, '.').replace(/\.+/g, '.').replace(/^\.|\.$/, '').substring(0, 30);

                  const existing = await userRepo.getByUsername(username);
                  if (existing) {
                    const updates: any = {};
                    if (areaCodigo && existing.areaCodigo !== areaCodigo) updates.areaCodigo = areaCodigo;
                    if (colab.cargo && existing.cargo !== colab.cargo) updates.cargo = colab.cargo;
                    if (colab.contato && existing.contato !== colab.contato) updates.contato = colab.contato;
                    if (Object.keys(updates).length > 0) {
                      try { await userRepo.update(existing.id, updates); usersUpdated++; } catch { /* skip */ }
                    }
                  } else {
                    const codigo = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                    const senhaHash = bcrypt.hashSync('plantonista123', 10);
                    try {
                      await userRepo.create({ codigo, areaCodigo, areaSolicitada: null, nome: colab.nome, perfil: 'Plantonista', nivelEscalonamento: null, cargo: colab.cargo || null, contato: colab.contato || null, username, senhaHash, ativo: true, aprovado: true });
                      usersCreated++;
                    } catch { /* skip */ }
                  }
                }
              }
            }

            // Auto-create Periodos + Escalas
            let periodosCreated = 0;
            let escalasCreated = 0;

            if (deps.periodoRepository && deps.escalaRepository && deps.areaRepository && deps.userRepository) {
              const periodoRepo = deps.periodoRepository;
              const escalaRepo = deps.escalaRepository;
              const areaRepo = deps.areaRepository;
              const userRepo = deps.userRepository;


              for (const entry of combinedResult.entries) {
                const allAreas = await areaRepo.getAll();
                const areaNorm = normalizeForComparison(entry.area);
                const matchedArea = allAreas.find(a => normalizeForComparison(a.nome) === areaNorm || normalizeForComparison(a.codigo) === areaNorm);
                if (!matchedArea) continue;

                const areaCodigo = matchedArea.codigo;
                const dateStr = `${importYear}-${String(importMonth).padStart(2, '0')}-${String(entry.dia).padStart(2, '0')}`;
                const horarios = entry.is24h ? '24hs' : `${entry.horarioInicio} às ${entry.horarioFim}`;

                const existingPeriodos = await periodoRepo.getByArea(areaCodigo);
                let periodo = existingPeriodos.find((p: any) => p.data === dateStr && p.horarios === horarios);
                if (!periodo) {
                  const periodoCodigo = `PER-${areaCodigo.substring(0, 10)}-${dateStr}-${Math.random().toString(36).substring(2, 5)}`;
                  try { periodo = await periodoRepo.create({ codigo: periodoCodigo, data: dateStr, horarios, areaCodigo }); periodosCreated++; } catch { continue; }
                }

                const userNorm = normalizeForComparison(entry.colaborador);
                const allUsers = await userRepo.getAll();
                const matchedUser = allUsers.find((u: any) => normalizeForComparison(u.nome) === userNorm && u.areaCodigo === areaCodigo);
                if (!matchedUser) continue;

                const existingEscalas = await escalaRepo.getByArea(areaCodigo);
                const alreadyExists = existingEscalas.some((e: any) => e.periodoCodigo === periodo.codigo && e.usuarioCodigo === matchedUser.codigo);
                if (alreadyExists) continue;

                const escalaCodigo = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
                try { await escalaRepo.create({ codigo: escalaCodigo, areaCodigo, periodoCodigo: periodo.codigo, usuarioCodigo: matchedUser.codigo }); escalasCreated++; } catch { /* skip */ }
              }
            }

            res.json({
              success: true,
              areas: combinedResult.areas.map(a => ({ nome: a.area, colaboradores: a.colaboradores.length })),
              totalEntries: combinedResult.entries.length,
              areasCreated,
              usersCreated,
              usersUpdated,
              periodosCreated,
              escalasCreated,
              errors: combinedResult.errors,
            });
            return;
          }
          // If no entries from multi-sheet, fall through to single-sheet processing
          csvContent = allResults[0].csv;
        }
      } catch (err) {
        const details = err instanceof Error ? err.message : String(err);
        console.error('[Import] Erro ao processar Excel:', err);
        res.status(400).json({ error: `Erro ao processar arquivo Excel: ${details}` });
        return;
      }
    } else {
      // CSV handling: Detect and strip UTF-8 BOM, with fallback to latin1
      let decoded = buffer.toString('utf-8');
      if (decoded.charCodeAt(0) === 0xFEFF) {
        decoded = decoded.slice(1);
      }
      if (hasGarbledCharacters(decoded)) {
        csvContent = buffer.toString('latin1');
      } else {
        csvContent = decoded;
      }
    }

    const result = parseEscalationCSV(csvContent);

    // Store in memory for on-call lookups
    escalationEntries = result.entries;

    // Persist to database
    if (deps.db) {
      const now = new Date();
      const brasiliaStr = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
      const brasiliaDate = new Date(brasiliaStr);
      // Use month/year from parsed file if available, otherwise current
      const importMonth = (result as any).importMonth || brasiliaDate.getMonth() + 1;
      const importYear = (result as any).importYear || brasiliaDate.getFullYear();

      await deps.db.query('BEGIN');
      try {
        // Clear existing entries for this month/year (per area to avoid wiping other areas)
        for (const area of result.areas) {
          await deps.db.query('DELETE FROM escalation_schedules WHERE area = $1 AND mes = $2 AND ano = $3', [area.area, importMonth, importYear]);
        }

        const insertSql = 'INSERT INTO escalation_schedules (area, colaborador, cargo, nivel, contato, dia, mes, ano, horario_inicio, horario_fim, is_24h) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)';
        for (const entry of result.entries) {
          await deps.db.query(
            insertSql,
            [entry.area, entry.colaborador, entry.cargo, entry.nivel, entry.contato, entry.dia, importMonth, importYear, entry.horarioInicio, entry.horarioFim, entry.is24h ? 1 : 0]
          );
        }
        await deps.db.query('COMMIT');
      } catch (e) {
        await deps.db.query('ROLLBACK');
        console.error('Import transaction error', e);
      }
    }

    // Auto-create or update areas and users from CSV data (merge/de-para)
    let areasCreated = 0;
    let usersCreated = 0;
    let usersUpdated = 0;

    if (deps.areaRepository && deps.userRepository) {
      const areaRepo = deps.areaRepository;
      const userRepo = deps.userRepository;
      const bcrypt = require('bcrypt');

      for (const parsedArea of result.areas) {
        // Use normalized comparison to find existing areas
        const allAreas = await areaRepo.getAll();
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
            await areaRepo.create({ codigo: areaCodigo, nome: parsedArea.area, torre: null, coordenadorNome: null, coordenadorContato: null, gerenteNome: null, gerenteContato: null });
            areasCreated++;
          } catch { /* skip */ }
        }

        for (const colab of parsedArea.colaboradores) {
          if (!colab.nome || colab.nome === 'xxxxx' || !isReadableText(colab.nome)) continue;

          const username = colab.nome.toLowerCase()
            .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]/g, '.')
            .replace(/\.+/g, '.').replace(/^\.|\.$/, '')
            .substring(0, 30);

          const existing = await userRepo.getByUsername(username);
          if (existing) {
            // MERGE: Update area, cargo, contato if changed
            const updates: any = {};
            if (areaCodigo && existing.areaCodigo !== areaCodigo) updates.areaCodigo = areaCodigo;
            if (colab.cargo && existing.cargo !== colab.cargo) updates.cargo = colab.cargo;
            if (colab.contato && existing.contato !== colab.contato) updates.contato = colab.contato;
            if (Object.keys(updates).length > 0) {
              try { await userRepo.update(existing.id, updates); usersUpdated++; } catch { /* skip */ }
            }
          } else {
            const codigo = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
            const senhaHash = bcrypt.hashSync('plantonista123', 10);
            try {
              await userRepo.create({
                codigo,
                areaCodigo,
                areaSolicitada: null,
                nome: colab.nome,
                perfil: 'Plantonista',
                nivelEscalonamento: null,
                cargo: colab.cargo || null,
                contato: colab.contato || null,
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

    // Auto-create Periodos + Escalas in formal tables (Tb_Periodos / Tb_Escalas)
    let periodosCreated = 0;
    let escalasCreated = 0;

    if (deps.periodoRepository && deps.escalaRepository && deps.areaRepository && deps.userRepository) {
      const periodoRepo = deps.periodoRepository;
      const escalaRepo = deps.escalaRepository;
      const areaRepo = deps.areaRepository;
      const userRepo = deps.userRepository;

      const now = new Date();
      const brasiliaStr2 = now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' });
      const brasiliaDate2 = new Date(brasiliaStr2);
      const importMonth = brasiliaDate2.getMonth() + 1;
      const importYear = brasiliaDate2.getFullYear();

      for (const entry of result.entries) {
        // Find area codigo
        const allAreas = await areaRepo.getAll();
        const areaNorm = normalizeForComparison(entry.area);
        const matchedArea = allAreas.find(a => normalizeForComparison(a.nome) === areaNorm || normalizeForComparison(a.codigo) === areaNorm);
        if (!matchedArea) continue;

        const areaCodigo = matchedArea.codigo;
        const dateStr = `${importYear}-${String(importMonth).padStart(2, '0')}-${String(entry.dia).padStart(2, '0')}`;
        const horarios = entry.is24h ? '24hs' : `${entry.horarioInicio} às ${entry.horarioFim}`;

        // Find or create periodo
        const existingPeriodos = await periodoRepo.getByArea(areaCodigo);
        let periodo = existingPeriodos.find((p: any) => p.data === dateStr && p.horarios === horarios);
        if (!periodo) {
          const periodoCodigo = `PER-${areaCodigo.substring(0, 10)}-${dateStr}-${Math.random().toString(36).substring(2, 5)}`;
          try {
            periodo = await periodoRepo.create({ codigo: periodoCodigo, data: dateStr, horarios, areaCodigo });
            periodosCreated++;
          } catch { continue; }
        }

        // Find user by name
        const userNorm = normalizeForComparison(entry.colaborador);
        const allUsers = await userRepo.getAll();
        const matchedUser = allUsers.find((u: any) => normalizeForComparison(u.nome) === userNorm && u.areaCodigo === areaCodigo);
        if (!matchedUser) continue;

        // Check if escala already exists for this combo
        const existingEscalas = await escalaRepo.getByArea(areaCodigo);
        const alreadyExists = existingEscalas.some((e: any) => e.periodoCodigo === periodo.codigo && e.usuarioCodigo === matchedUser.codigo);
        if (alreadyExists) continue;

        const escalaCodigo = `ESC-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        try {
          escalaRepo.create({ codigo: escalaCodigo, areaCodigo, periodoCodigo: periodo.codigo, usuarioCodigo: matchedUser.codigo });
          escalasCreated++;
        } catch { /* skip */ }
      }
    }

    res.json({
      success: true,
      areas: result.areas.map(a => ({ nome: a.area, colaboradores: a.colaboradores.length })),
      totalEntries: result.entries.length,
      areasCreated,
      usersCreated,
      usersUpdated,
      periodosCreated,
      escalasCreated,
      errors: result.errors,
    });
  });

  // GET /api/escalation/on-call — Quem está de plantão hoje (por área)
  app.get('/api/escalation/on-call', async (_req: Request, res: Response) => {
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
        const dbAreas = await deps.areaRepository.getAll();
        res.json(dbAreas.map(a => ({ area: a.nome, plantonistas: [] })));
        return;
      }
      res.json([]);
      return;
    }

    // Pre-fetch areas once for use in the map
    const allDbAreas = deps.areaRepository ? await deps.areaRepository.getAll() : [];

    const result = entryAreas.map(area => {
      const onCall = getCurrentOnCallForArea(escalationEntries, area);
      const areaNorm = normalizeForComparison(area);
      
      if (onCall.length > 0) {
        const matchedArea = allDbAreas.find(a => normalizeForComparison(a.nome) === areaNorm || normalizeForComparison(a.codigo) === areaNorm);
        return {
          area,
          coordenador: {
            nome: matchedArea?.coordenadorNome || '',
            contato: matchedArea?.coordenadorContato || ''
          },
          gerente: {
            nome: matchedArea?.gerenteNome || '',
            contato: matchedArea?.gerenteContato || ''
          },
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

        const matchedArea = allDbAreas.find(a => normalizeForComparison(a.nome) === areaNorm || normalizeForComparison(a.codigo) === areaNorm);
        return {
          area,
          coordenador: {
            nome: matchedArea?.coordenadorNome || '',
            contato: matchedArea?.coordenadorContato || ''
          },
          gerente: {
            nome: matchedArea?.gerenteNome || '',
            contato: matchedArea?.gerenteContato || ''
          },
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

  // GET /api/escalation/schedule — Retorna escala completa por área/mês (para view matricial)
  app.get('/api/escalation/schedule', async (req: Request, res: Response) => {
    const area = req.query.area as string || '';
    const month = parseInt(req.query.month as string) || new Date().getMonth() + 1;
    const year = parseInt(req.query.year as string) || new Date().getFullYear();

    if (!deps.db) { res.json([]); return; }

    try {
      let entries: any[] = [];
      
      // Match by area codigo or area name
      const areaObj = await deps.areaRepository?.getByCodigo(area);
      const areaName = areaObj ? areaObj.nome : area;

      // Try multiple variations of the area name
      const variations = [area, areaName];
      if (areaName) {
        variations.push(areaName.replace(/ \/ /g, '/'));
        variations.push(areaName.replace(/\//g, ' / '));
        variations.push(areaName.replace(/\//g, ' ')); // Excel can't have / in sheet name
        variations.push(areaName.replace(/\//g, '-')); // Excel can't have / in sheet name
      }

      // 1. Try from escalation_schedules table
      const resQuery1 = await deps.db.query(
        `SELECT * FROM escalation_schedules WHERE area ILIKE ANY($1) AND mes = $2 AND ano = $3`,
        [variations, month, year]
      );
      entries = resQuery1.rows as any[];

      // 2. Also fetch from formal tables (periodos + escalas + users) 
      const datePrefix = `${year}-${String(month).padStart(2, '0')}`;
      const resQuery2 = await deps.db.query(`
        SELECT u.nome as colaborador, u.cargo, u.nivel_escalonamento as nivel, u.contato,
               p.data, p.horarios, e.area_codigo
        FROM escalas e
        JOIN periodos p ON p.codigo = e.periodo_codigo
        JOIN users u ON u.codigo = e.usuario_codigo
        WHERE e.area_codigo ILIKE $1 AND p.data LIKE $2
      `, [area, `${datePrefix}%`]);
      const formalEntries = resQuery2.rows as any[];

      for (const fe of formalEntries) {
        const dayNum = parseInt(fe.data.split('-')[2]);
        // Check if not already in entries (avoid duplicates)
        const exists = entries.some((x: any) => x.colaborador === fe.colaborador && x.dia === dayNum);
        if (!exists) {
          // Parse horarios to get inicio/fim
          let horarioInicio = '', horarioFim = '', is24h = false;
          if (fe.horarios === '24hs' || fe.horarios === '24h') {
            horarioInicio = '00:00'; horarioFim = '23:59'; is24h = true;
          } else if (fe.horarios && fe.horarios.includes('às')) {
            const parts = fe.horarios.split('às').map((s: string) => s.trim());
            horarioInicio = parts[0]; horarioFim = parts[1];
          } else if (fe.horarios && fe.horarios.includes('-')) {
            const parts = fe.horarios.split('-').map((s: string) => s.trim());
            horarioInicio = parts[0]; horarioFim = parts[1];
          }

          entries.push({
            area: fe.area_codigo,
            colaborador: fe.colaborador,
            cargo: fe.cargo || '',
            nivel: fe.nivel || '1º Escalão',
            contato: fe.contato || '',
            dia: dayNum,
            mes: month,
            ano: year,
            horario_inicio: horarioInicio,
            horario_fim: horarioFim,
            is_24h: is24h ? 1 : 0,
          });
        }
      }

      const result = entries.map((e: any) => ({
        colaborador: e.colaborador,
        cargo: e.cargo || '',
        nivel: e.nivel || '1º Escalão',
        contato: e.contato || '',
        area: e.area,
        dia: e.dia,
        horarioInicio: e.horario_inicio,
        horarioFim: e.horario_fim,
        is24h: e.is_24h === 1,
      }));

      res.json(result);
    } catch {
      res.json([]);
    }
  });

  // GET /api/escalation/template — Download do template XLSX
  app.get('/api/escalation/template', (_req: Request, res: Response) => {
    const fs = require('fs');
    const path = require('path');
    // Try XLSX first, then CSV fallback
    const xlsxPath = path.join(process.cwd(), 'templates', 'Template_Escalonamento.xlsx');
    const csvPath = path.join(process.cwd(), 'templates', 'Template_Escalonamento.csv');
    
    if (fs.existsSync(xlsxPath)) {
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', 'attachment; filename=Template_Escalonamento.xlsx');
      res.sendFile(xlsxPath);
    } else if (fs.existsSync(csvPath)) {
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=Template_Escalonamento.csv');
      res.sendFile(csvPath);
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
  app.get('/api/monitor-mappings', async (_req: Request, res: Response) => {
    const monitors = deps.datadogPollingService.getMonitors();
    const unmapped = await deps.monitorMappingService.getUnmappedMonitors(monitors);
    const teams = await deps.teamRepository.getAll();

    const mappingsByTeam: Record<string, any[]> = {};
    for (const team of teams) {
      mappingsByTeam[team.id] = await deps.monitorMappingService.getMappingsForTeam(team.id);
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

    app.put('/api/monitors/:monitorId/map-area', async (req: Request, res: Response) => {
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
        const area = await deps.areaRepository.getByCodigo(areaCodigo);
        if (!area) {
          res.status(400).json({ error: 'Área não encontrada' });
          return;
        }
      }

      await monitorAreaMappingRepo.setMapping(monitorId, areaCodigo, monitorName || `Monitor ${monitorId}`);
      res.json({ success: true, monitorId, areaCodigo });
    });

    // GET /api/monitor-area-mappings — Get all monitor-area mappings
    app.get('/api/monitor-area-mappings', async (_req: Request, res: Response) => {
      const mappings = await monitorAreaMappingRepo.getAllMapped();
      res.json(mappings);
    });

    // GET /api/dashboard/monitors-by-area — Monitors grouped by area with on-call/fallback status
    app.get('/api/dashboard/monitors-by-area', async (req: Request, res: Response) => {
      let monitors = deps.datadogPollingService.getMonitors();
      
      // Fallback: if no monitors from Datadog, load from DB
      if ((!monitors || monitors.length === 0) && deps.db) {
        try {
          const dbMonitors = (await deps.db.query('SELECT id, name, state, tags, priority, area_codigo FROM monitors')).rows as any[];
          if (dbMonitors.length > 0) {
            monitors = dbMonitors.map((m: any) => ({
              id: m.id,
              name: m.name,
              state: m.state || 'OK',
              tags: m.tags ? m.tags.split(',').map((t: string) => t.trim()) : [],
              priority: m.priority || 'P1',
              areaCodigo: m.area_codigo,
              teamId: m.area_codigo || '',
              lastUpdated: new Date(),
            }));
          }
        } catch { /* table may not exist */ }
      }
      
      const manualMappings = await monitorAreaMappingRepo.getAllMapped();

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
              const area = await deps.areaRepository.getByCodigo(manualMapping.areaCodigo);
              if (area) areaNome = area.nome;
            }
            areaGroups[key] = { areaCodigo: key, areaNome, monitors: [] };
          }
          areaGroups[key].monitors.push(monitor);
        } else {
          // Fallback to auto-mapping or use areaCodigo from DB monitor
          const monitorAreaCode = (monitor as any).areaCodigo;
          const primaryArea = monitorAreaCode || getPrimaryAreaForMonitor(monitor.name);
          if (primaryArea) {
            // Try to find matching area codigo from area repository
            let areaCodigo = primaryArea;
            let areaNome = primaryArea;
            if (deps.areaRepository) {
              const allAreas = await deps.areaRepository.getAll();
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

      const groupsWithOnCall = await Promise.all(Object.values(areaGroups).map(async group => {
        // Determine if there is a plantonista scheduled today for this area
        let scheduledPlantonista: { nome: string; usuarioCodigo: string } | null = null;

        if (deps.escalaRepository && deps.periodoRepository && deps.userRepository) {
          const escalas = await deps.escalaRepository.getByArea(group.areaCodigo);
          const periodos = await deps.periodoRepository.getByArea(group.areaCodigo);

          // Find periodos matching today
          const todayPeriodos = periodos.filter(p => p.data === todayStr);
          if (todayPeriodos.length > 0) {
            const periodoCodigos = new Set(todayPeriodos.map(p => p.codigo));
            const todayEscala = escalas.find(e => periodoCodigos.has(e.periodoCodigo));
            if (todayEscala) {
              const allUsers = await deps.userRepository.getAll();
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
          const fallback = await resolveAreaFallback(group.areaCodigo, deps.userRepository, deps.areaRepository);
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
      }));

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
    app.get('/api/auth/me', authMiddleware, async (req: Request, res: Response) => {
      if (!deps.userRepository) {
        res.status(500).json({ error: 'User repository not available' });
        return;
      }
      const user = await deps.userRepository.getById(req.user!.userId);
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
      app.get('/api/users', authMiddleware, roleMiddleware(['Adm', 'Responsavel']), dbAreaFilterMiddleware, async (req: Request, res: Response) => {
        let users = await userRepository.getAll();
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
        let usersWithoutPassword = users.map(({ senhaHash, ...u }) => u as any);
        
        if (deps.userAreaRepository) {
          const uar = deps.userAreaRepository;
          usersWithoutPassword = await Promise.all(usersWithoutPassword.map(async u => {
            const extras = await uar.getAreasForUser(u.id);
            return { ...u, areasExtras: extras };
          }));
        }

        res.json({ users: usersWithoutPassword, total: usersWithoutPassword.length });
      });

      // POST /api/users — Criar usuário (admin only)
      app.post('/api/users', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), async (req: Request, res: Response) => {
        const { codigo, areaCodigo, areasExtras, nome, perfil, cargo, contato, username, senha } = req.body || {};
        if (!codigo || !nome || !perfil || !username || !senha) {
          res.status(400).json({ error: 'codigo, nome, perfil, username e senha são obrigatórios' });
          return;
        }
        const result = await authService.register({ codigo, areaCodigo, nome, perfil, cargo, contato, username, senha });
        if (!result.success) {
          res.status(400).json({ error: result.error });
          return;
        }
        
        if (areasExtras && Array.isArray(areasExtras) && deps.userAreaRepository) {
          for (const extra of areasExtras) {
            await deps.userAreaRepository.addAreaBinding(result.user!.id, extra);
          }
        }
        
        res.status(201).json({ user: result.user });
      });

      // PUT /api/users/:id — Editar usuário
      app.put('/api/users/:id', authMiddleware, writeBlockMiddleware, async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = await userRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Usuário não encontrado' });
          return;
        }
        const { codigo, areaCodigo, areasExtras, nome, perfil, cargo, contato, username, nivelEscalonamento, ativo } = req.body || {};
        const updated = await userRepository.update(id, { codigo, areaCodigo, nome, perfil, cargo, contato, username, nivelEscalonamento, ativo });
        if (!updated) {
          res.status(500).json({ error: 'Erro ao atualizar usuário' });
          return;
        }
        
        if (areasExtras && Array.isArray(areasExtras) && deps.userAreaRepository) {
           const uar = deps.userAreaRepository;
           const currentExtras = await uar.getAreasForUser(id);
           for (const cur of currentExtras) {
             if (!areasExtras.includes(cur)) await uar.removeAreaBinding(id, cur);
           }
           for (const next of areasExtras) {
             if (!currentExtras.includes(next)) await uar.addAreaBinding(id, next);
           }
        }
        
        const { senhaHash, ...userWithoutPassword } = updated;
        res.json(userWithoutPassword);
      });

      // DELETE /api/users/:id — Deletar usuário (admin only)
      app.delete('/api/users/:id', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = await userRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Usuário não encontrado' });
          return;
        }
        await userRepository.delete(id);
        res.json({ success: true });
      });

      // POST /api/users/cleanup — Remove usuários com dados corrompidos/ilegíveis (admin only)
      app.post('/api/users/cleanup', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), async (_req: Request, res: Response) => {
        const allUsers = await userRepository.getAll();
        let removed = 0;

        for (const user of allUsers) {
          if (!isReadableText(user.nome) || !isReadableText(user.username) || !isReadableText(user.cargo || '') || !isReadableText(user.contato || '')) {
            await userRepository.delete(user.id);
            removed++;
          }
        }

        // Also clean corrupted areas
        let areasRemoved = 0;
        if (deps.areaRepository) {
          const allAreas = await deps.areaRepository.getAll();
          for (const area of allAreas) {
            if (!isReadableText(area.nome) || !isReadableText(area.codigo)) {
              try {
                await deps.db.query('DELETE FROM areas WHERE id = $1', [area.id]);
                areasRemoved++;
              } catch { /* skip */ }
            }
          }
        }

        // Clean corrupted escalation schedules
        let schedulesRemoved = 0;
        if (deps.db) {
          try {
            const schedules = (await deps.db.query('SELECT id, area, colaborador FROM escalation_schedules')).rows as any[];
            for (const sched of schedules) {
              if (!isReadableText(sched.area) || !isReadableText(sched.colaborador)) {
                await deps.db.query('DELETE FROM escalation_schedules WHERE id = $1', [sched.id]);
                schedulesRemoved++;
              }
            }
          } catch { /* table may not exist */ }
        }

        res.json({
          success: true,
          usersRemoved: removed,
          areasRemoved,
          schedulesRemoved,
          message: `Limpeza concluída: ${removed} usuários, ${areasRemoved} áreas e ${schedulesRemoved} registros de escala corrompidos removidos.`,
        });
      });

      // POST /api/users/:id/approve — Aprovar plantonista pendente (Responsável/Adm)
      app.post('/api/users/:id/approve', authMiddleware, roleMiddleware(['Adm', 'Responsavel']), async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
        const existing = await userRepository.getById(id);
        if (!existing) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
        // Move user from PENDENTE_APROVACAO to their requested area
        const targetArea = existing.areaSolicitada || existing.areaCodigo;
        await userRepository.update(id, { aprovado: true, areaCodigo: targetArea, areaSolicitada: null });
        res.json({ success: true, message: 'Plantonista aprovado!' });
      });

      // POST /api/users/:id/reject — Rejeitar plantonista pendente (Responsável/Adm)
      app.post('/api/users/:id/reject', authMiddleware, roleMiddleware(['Adm', 'Responsavel']), async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
        const existing = await userRepository.getById(id);
        if (!existing) { res.status(404).json({ error: 'Usuário não encontrado' }); return; }
        await userRepository.update(id, { ativo: false, aprovado: false });
        res.json({ success: true, message: 'Plantonista rejeitado.' });
      });

      // GET /api/users/pending — Listar plantonistas pendentes de aprovação
      app.get('/api/users/pending', authMiddleware, roleMiddleware(['Adm', 'Responsavel']), async (_req: Request, res: Response) => {
        const allUsers = await userRepository.getAll();
        const pending = allUsers.filter((u: any) => !u.aprovado && u.ativo);
        const result = pending.map(({ senhaHash, ...u }: any) => u);
        res.json(result);
      });

      // === User-Area Binding Routes ===

      if (deps.userAreaRepository) {
        const userAreaRepo = deps.userAreaRepository;

        // GET /api/users/:id/areas — List linked areas for a user
        app.get('/api/users/:id/areas', authMiddleware, async (req: Request, res: Response) => {
          const id = parseInt(req.params.id as string, 10);
          if (isNaN(id)) {
            res.status(400).json({ error: 'ID inválido' });
            return;
          }
          const existing = await userRepository.getById(id);
          if (!existing) {
            res.status(404).json({ error: 'Usuário não encontrado' });
            return;
          }
          const areas = await userAreaRepo.getAreasForUser(id);
          res.json(areas);
        });

        // POST /api/users/:id/areas — Add area binding (Admin only)
        app.post('/api/users/:id/areas', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), async (req: Request, res: Response) => {
          const id = parseInt(req.params.id as string, 10);
          if (isNaN(id)) {
            res.status(400).json({ error: 'ID inválido' });
            return;
          }
          const existing = await userRepository.getById(id);
          if (!existing) {
            res.status(404).json({ error: 'Usuário não encontrado' });
            return;
          }
          const { areaCodigo } = req.body || {};
          if (!areaCodigo) {
            res.status(400).json({ error: 'areaCodigo é obrigatório' });
            return;
          }
          await userAreaRepo.addAreaBinding(id, areaCodigo);
          res.status(201).json({ success: true, userId: id, areaCodigo });
        });

        // DELETE /api/users/:id/areas/:areaCodigo — Remove area binding (Admin only)
        app.delete('/api/users/:id/areas/:areaCodigo', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), async (req: Request, res: Response) => {
          const id = parseInt(req.params.id as string, 10);
          if (isNaN(id)) {
            res.status(400).json({ error: 'ID inválido' });
            return;
          }
          const existing = await userRepository.getById(id);
          if (!existing) {
            res.status(404).json({ error: 'Usuário não encontrado' });
            return;
          }
          const areaCodigo = req.params.areaCodigo as string;
          await userAreaRepo.removeAreaBinding(id, areaCodigo);
          res.json({ success: true });
        });
      }
    }

    // === Area CRUD Routes ===

    if (deps.areaRepository) {
      const areaRepo = deps.areaRepository;

      // GET /api/areas — Listar áreas cadastradas
      app.get('/api/areas', authMiddleware, dbAreaFilterMiddleware, async (req: Request, res: Response) => {
        const effectiveAreas = getEffectiveAreas(req);
        let areas = await areaRepo.getAll();
        if (effectiveAreas !== null) {
          areas = areas.filter(a => effectiveAreas.includes(a.codigo));
        }
        res.json(areas);
      });

      // POST /api/areas — Criar nova área (admin only)
      app.post('/api/areas', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), async (req: Request, res: Response) => {
        const { codigo, nome, torre, coordenadorNome, coordenadorContato, gerenteNome, gerenteContato } = req.body || {};
        if (!codigo || !nome) {
          res.status(400).json({ error: 'codigo e nome são obrigatórios' });
          return;
        }
        const allAreas = await areaRepo.getAll();
        if (allAreas.find(a => a.codigo.toLowerCase() === codigo.toLowerCase())) {
           res.status(400).json({ error: 'Já existe uma Área cadastrada com este Código.' });
           return;
        }
        if (allAreas.find(a => a.nome.toLowerCase() === nome.toLowerCase())) {
           res.status(400).json({ error: 'Já existe uma Área cadastrada com este Nome.' });
           return;
        }
        const area = await areaRepo.create({ codigo, nome, torre: torre || null, coordenadorNome: coordenadorNome || null, coordenadorContato: coordenadorContato || null, gerenteNome: gerenteNome || null, gerenteContato: gerenteContato || null });
        res.status(201).json(area);
      });

      // PUT /api/areas/:id — Editar área
      app.put('/api/areas/:id', authMiddleware, writeBlockMiddleware, async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = await areaRepo.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Área não encontrada' });
          return;
        }
        const { codigo, nome, torre, coordenadorNome, coordenadorContato, gerenteNome, gerenteContato } = req.body || {};
        const allAreas = await areaRepo.getAll();
        
        if (codigo && codigo.toLowerCase() !== existing.codigo.toLowerCase() && allAreas.find(a => a.codigo.toLowerCase() === codigo.toLowerCase())) {
           res.status(400).json({ error: 'Já existe uma Área cadastrada com este Código.' });
           return;
        }
        if (nome && nome.toLowerCase() !== existing.nome.toLowerCase() && allAreas.find(a => a.nome.toLowerCase() === nome.toLowerCase())) {
           res.status(400).json({ error: 'Já existe uma Área cadastrada com este Nome.' });
           return;
        }

        const updated = await areaRepo.update(id, { codigo, nome, torre, coordenadorNome, coordenadorContato, gerenteNome, gerenteContato });
        res.json(updated);
      });

      // DELETE /api/areas/:id — Deletar área (admin only)
      app.delete('/api/areas/:id', authMiddleware, writeBlockMiddleware, roleMiddleware(['Adm']), async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = await areaRepo.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Área não encontrada' });
          return;
        }
        try {
          await areaRepo.delete(id);
          res.status(204).send();
        } catch (err: any) {
          if (err.code === '23503') {
             res.status(400).json({ error: 'Não é possível excluir esta Área pois ela possui usuários, escalas, horários ou incidentes vinculados a ela no sistema.' });
             return;
          }
          res.status(500).json({ error: 'Erro interno ao deletar área.' });
        }
      });

      // === Area Escalation Chain Routes ===

      if (deps.areaEscalationChainRepository) {
        const areaEscalationChainRepo = deps.areaEscalationChainRepository;

        // GET /api/areas/:codigo/escalation-chain — Get escalation chain for an area
        app.get('/api/areas/:codigo/escalation-chain', authMiddleware, async (req: Request, res: Response) => {
          const codigo = req.params.codigo as string;
          const area = await deps.areaRepository!.getByCodigo(codigo);
          if (!area) {
            res.status(404).json({ error: 'Área não encontrada' });
            return;
          }
          const chain = await areaEscalationChainRepo.getByArea(codigo);
          res.json(chain);
        });

        // PUT /api/areas/:codigo/escalation-chain — Save escalation chain for an area
        app.put('/api/areas/:codigo/escalation-chain', authMiddleware, writeBlockMiddleware, async (req: Request, res: Response) => {
          const codigo = req.params.codigo as string;
          const area = await deps.areaRepository!.getByCodigo(codigo);
          if (!area) {
            res.status(404).json({ error: 'Área não encontrada' });
            return;
          }
          const { chain } = req.body || {};
          if (!Array.isArray(chain)) {
            res.status(400).json({ error: 'Body deve conter um array "chain" de membros da cadeia de escalação' });
            return;
          }
          await areaEscalationChainRepo.replaceChain(codigo, chain);
          res.json({ success: true });
        });
      }

      // GET /api/areas/:codigo/users — Get all users in an area
      app.get('/api/areas/:codigo/users', authMiddleware, async (req: Request, res: Response) => {
        const codigo = req.params.codigo as string;
        const area = await deps.areaRepository!.getByCodigo(codigo);
        if (!area) {
          res.status(404).json({ error: 'Área não encontrada' });
          return;
        }
        if (deps.userRepository) {
          const users = await deps.userRepository.getByArea(codigo);
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
      app.get('/api/periodos/calendar', authMiddleware, dbAreaFilterMiddleware, async (req: Request, res: Response) => {
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
        const periodos = await periodoRepository.getByArea(areaCodigo);

        // Build a map of date -> periodo info
        const daysInMonth = new Date(year, month, 0).getDate();
        const days: Array<{ date: string; hasAssignment: boolean; plantonista?: string; horarios?: string }> = [];

        // Get escalas for this area (if escalaRepository is available)
        const escalaRepo = deps.escalaRepository;
        const userRepo = deps.userRepository;
        const allEscalas = escalaRepo ? await escalaRepo.getByArea(areaCodigo) : [];

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
              const allUsers = await userRepo.getAll();
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
      app.get('/api/periodos', authMiddleware, dbAreaFilterMiddleware, async (req: Request, res: Response) => {
        const areaCodigo = req.query.areaCodigo as string | undefined;
        const effectiveAreas = getEffectiveAreas(req);

        if (areaCodigo) {
          // If user specifies area filter, validate against their access
          if (effectiveAreas !== null && !effectiveAreas.includes(areaCodigo)) {
            res.status(403).json({ error: 'Acesso restrito à sua área de responsabilidade' });
            return;
          }
          const periodos = await periodoRepository.getByArea(areaCodigo);
          res.json(periodos);
        } else if (effectiveAreas !== null) {
          // Non-admin users or Responsável get filtered by their areas
          const promises = effectiveAreas.map(area => periodoRepository.getByArea(area));
          const allPeriodos = (await Promise.all(promises)).flat();
          res.json(allPeriodos);
        } else {
          const periodos = await periodoRepository.getAll();
          res.json(periodos);
        }
      });

      // POST /api/periodos — Criar período
      app.post('/api/periodos', authMiddleware, writeBlockMiddleware, async (req: Request, res: Response) => {
        const { codigo, data, horarios, areaCodigo } = req.body || {};
        if (!data || !horarios || !areaCodigo) {
          res.status(400).json({ error: 'data, horarios e areaCodigo são obrigatórios' });
          return;
        }

        // CHECK 4: Trava de Horário (Período)
        const areaPeriodos = await periodoRepository.getByArea(areaCodigo);
        const duplicatedPeriodo = areaPeriodos.find(p => p.data === data && p.horarios === horarios);
        if (duplicatedPeriodo) {
          res.status(400).json({ error: 'Já existe um cadastro com este mesmo horário e data para esta área.' });
          return;
        }

        // Auto-generate code if not provided (backwards compatible)
        const finalCodigo = codigo || await periodoRepository.generateCode(areaCodigo, data);
        const periodo = await periodoRepository.create({ codigo: finalCodigo, data, horarios, areaCodigo });
        res.status(201).json(periodo);
      });

      // PUT /api/periodos/:id — Editar período
      app.put('/api/periodos/:id', authMiddleware, writeBlockMiddleware, async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = await periodoRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Período não encontrado' });
          return;
        }
        const { codigo, data, horarios, areaCodigo } = req.body || {};
        const updated = await periodoRepository.update(id, { codigo, data, horarios, areaCodigo });
        res.json(updated);
      });

      // DELETE /api/periodos/:id — Deletar período
      app.delete('/api/periodos/:id', authMiddleware, writeBlockMiddleware, async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = await periodoRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Período não encontrado' });
          return;
        }
        try {
           await periodoRepository.deleteById(id);
           res.status(204).send();
        } catch (err: any) {
           if (err.code === '23503') {
              res.status(400).json({ error: 'Não é possível excluir este Horário pois já existem escalas vinculadas a ele.' });
              return;
           }
           res.status(500).json({ error: 'Erro interno ao deletar período.' });
        }
      });
    }

    // === Escala CRUD Routes ===

    if (deps.escalaRepository) {
      const escalaRepository = deps.escalaRepository;

      // GET /api/escalas — Listar escalas (opcionalmente por área, filtrado por perfil)
      app.get('/api/escalas', authMiddleware, dbAreaFilterMiddleware, async (req: Request, res: Response) => {
        const areaCodigo = req.query.areaCodigo as string | undefined;
        const effectiveAreas = getEffectiveAreas(req);

        if (areaCodigo) {
          // If user specifies area filter, validate against their access
          if (effectiveAreas !== null && !effectiveAreas.includes(areaCodigo)) {
            res.status(403).json({ error: 'Acesso restrito à sua área de responsabilidade' });
            return;
          }
          const escalas = await escalaRepository.getByArea(areaCodigo);
          res.json(escalas);
        } else if (effectiveAreas !== null) {
          // Non-admin users or Responsável get filtered by their areas
          const promises = effectiveAreas.map(area => escalaRepository.getByArea(area));
          const allEscalas = (await Promise.all(promises)).flat();
          res.json(allEscalas);
        } else {
          const escalas = await escalaRepository.getAll();
          res.json(escalas);
        }
      });

      // POST /api/escalas — Criar escala (vincular área + período + plantonista)
      app.post('/api/escalas', authMiddleware, writeBlockMiddleware, async (req: Request, res: Response) => {
        const { codigo, areaCodigo, periodoCodigo, usuarioCodigo } = req.body || {};
        if (!codigo || !areaCodigo || !periodoCodigo || !usuarioCodigo) {
          res.status(400).json({ error: 'codigo, areaCodigo, periodoCodigo e usuarioCodigo são obrigatórios' });
          return;
        }

        const allEscalas = await escalaRepository.getAll();
        
        // CHECK 2: Trava de Área (Escala)
        const conflitoArea = allEscalas.find(e => e.areaCodigo === areaCodigo && e.periodoCodigo === periodoCodigo);
        if (conflitoArea) {
           res.status(400).json({ error: 'Já existe um plantonista cobrindo esta área neste horário.' });
           return;
        }

        // CHECK 1: Trava de Plantonista (Escala)
        const conflitoPlantonista = allEscalas.find(e => e.usuarioCodigo === usuarioCodigo && e.periodoCodigo === periodoCodigo);
        if (conflitoPlantonista) {
           res.status(400).json({ error: 'Este plantonista já está ocupado neste dia e horário.' });
           return;
        }

        const escala = await escalaRepository.create({ codigo, areaCodigo, periodoCodigo, usuarioCodigo });
        res.status(201).json(escala);
      });

      // PUT /api/escalas/:id — Editar escala
      app.put('/api/escalas/:id', authMiddleware, writeBlockMiddleware, async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = await escalaRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Escala não encontrada' });
          return;
        }
        const { codigo, areaCodigo, periodoCodigo, usuarioCodigo } = req.body || {};
        const updated = await escalaRepository.update(id, { codigo, areaCodigo, periodoCodigo, usuarioCodigo });
        res.json(updated);
      });

      // DELETE /api/escalas/:id — Deletar escala
      app.delete('/api/escalas/:id', authMiddleware, writeBlockMiddleware, async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as string, 10);
        if (isNaN(id)) {
          res.status(400).json({ error: 'ID inválido' });
          return;
        }
        const existing = await escalaRepository.getById(id);
        if (!existing) {
          res.status(404).json({ error: 'Escala não encontrada' });
          return;
        }
        await escalaRepository.delete(id);
        res.json({ success: true });
      });
    }
  }

  // === Problema CRUD Routes ===

  if (deps.problemaRepository) {
    const problemaRepo = deps.problemaRepository;

    // GET /api/problemas/template — Download do template CSV para Problemas
    app.get('/api/problemas/template', (_req: Request, res: Response) => {
      const csv = 'Código,Descrição,Área 1,Área 2,Área 3,Área 4,Área 5\nPROB-01,"Exemplo de Problema",ÁREA-TI,ÁREA-REDES,,,';
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=Template_Problemas.csv');
      res.send(csv);
    });

    // GET /api/problemas/export — Exportar problemas em CSV
    app.get('/api/problemas/export', async (_req: Request, res: Response) => {
      try {
        const problemas = await problemaRepo.getAllWithAreas();
        let csv = 'Código,Descrição,Área 1,Área 2,Área 3,Área 4,Área 5\n';
        for (const p of problemas) {
          const row = [
            `"${p.codigo}"`,
            `"${p.descricao}"`,
            p.areas[0]?.areaCodigo ? `"${p.areas[0].areaCodigo}"` : '',
            p.areas[1]?.areaCodigo ? `"${p.areas[1].areaCodigo}"` : '',
            p.areas[2]?.areaCodigo ? `"${p.areas[2].areaCodigo}"` : '',
            p.areas[3]?.areaCodigo ? `"${p.areas[3].areaCodigo}"` : '',
            p.areas[4]?.areaCodigo ? `"${p.areas[4].areaCodigo}"` : '',
          ];
          csv += row.join(',') + '\n';
        }
        res.setHeader('Content-Type', 'text/csv;charset=utf-8;');
        res.setHeader('Content-Disposition', 'attachment; filename=problemas.csv');
        res.send('\uFEFF' + csv); // BOM for Excel
      } catch (e) {
        res.status(500).json({ error: 'Erro ao exportar problemas' });
      }
    });

    // POST /api/problemas/import — Importar problemas via CSV
    app.post('/api/problemas/import', upload.single('file'), async (req: Request, res: Response) => {
      if (!req.file) {
        res.status(400).json({ error: 'Nenhum arquivo enviado' });
        return;
      }
      
      const buffer = req.file.buffer;
      const fileName = (req.file.originalname || '').toLowerCase();
      let csvContent = '';

      if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        const XLSX = require('xlsx');
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        csvContent = XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]]);
      } else {
        csvContent = buffer.toString('utf8');
      }

      const lines = csvContent.split(/\r?\n/).map(l => l.trim()).filter(l => l);
      if (lines.length < 2) {
        res.status(400).json({ error: 'Arquivo vazio ou sem dados' });
        return;
      }

      const { parseCSVRow, normalizeForComparison } = require('./services/escalation-csv-processor');
      const allProblemas = await problemaRepo.getAll();
      const allAreas = deps.areaRepository ? await deps.areaRepository.getAll() : [];
      let created = 0, updated = 0, errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const row = parseCSVRow(lines[i]);
        const codigo = (row[0] || '').trim();
        const descricao = (row[1] || '').trim();
        if (!codigo || !descricao) continue;

        const areaCols = row.slice(2, 7).map((a: string) => a.trim()).filter((a: string) => a);
        const problemaAreas = [];
        let ordem = 1;

        for (const areaName of areaCols) {
          const norm = normalizeForComparison(areaName);
          const area = allAreas.find((a: any) => normalizeForComparison(a.nome) === norm || normalizeForComparison(a.codigo) === norm);
          if (area) {
            problemaAreas.push({ areaCodigo: area.codigo, ordem: ordem++ });
          } else {
            errors.push(`Linha ${i+1}: Área '${areaName}' não encontrada.`);
          }
        }

        const existing = allProblemas.find(p => p.codigo === codigo);
        if (existing) {
          await problemaRepo.update(existing.id, { codigo, descricao });
          await problemaRepo.replaceAreas(existing.id, problemaAreas);
          updated++;
        } else {
          try {
            const p = await problemaRepo.create({ codigo, descricao });
            await problemaRepo.replaceAreas(p.id, problemaAreas);
            created++;
          } catch {
            errors.push(`Linha ${i+1}: Falha ao criar problema '${codigo}' (possível descrição duplicada).`);
          }
        }
      }

      res.json({ success: true, created, updated, errors });
    });
    // GET /api/problemas — Listar problemas com áreas
    app.get('/api/problemas', async (_req: Request, res: Response) => {
      const problemas = await problemaRepo.getAllWithAreas();
      res.json(problemas);
    });

    // GET /api/problemas/:id — Detalhes de um problema
    app.get('/api/problemas/:id', async (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const problema = await problemaRepo.getById(id);
      if (!problema) { res.status(404).json({ error: 'Problema não encontrado' }); return; }
      const areas = await problemaRepo.getAreas(id);
      res.json({ ...problema, areas });
    });

    // POST /api/problemas — Criar problema
    app.post('/api/problemas', async (req: Request, res: Response) => {
      const { codigo, descricao, areas } = req.body || {};
      if (!codigo || !descricao) {
        res.status(400).json({ error: 'codigo e descricao são obrigatórios' });
        return;
      }

      const allProblemas = await problemaRepo.getAll();

      // Check unique codigo
      if (allProblemas.find(p => p.codigo === codigo)) {
        res.status(400).json({ error: 'Já existe um problema cadastrado com este Código.' });
        return;
      }

      // Check unique description
      if (allProblemas.find(p => p.descricao.toLowerCase() === descricao.toLowerCase())) {
        res.status(400).json({ error: 'Já existe um problema cadastrado com esta exata Descrição.' });
        return;
      }

      const problema = await problemaRepo.create({ codigo, descricao });
      // Add areas if provided
      if (Array.isArray(areas) && areas.length > 0) {
        await problemaRepo.replaceAreas(problema.id, areas);
      }
      const result = { ...problema, areas: await problemaRepo.getAreas(problema.id) };
      res.status(201).json(result);
    });

    // PUT /api/problemas/:id — Editar problema
    app.put('/api/problemas/:id', async (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const existing = await problemaRepo.getById(id);
      if (!existing) { res.status(404).json({ error: 'Problema não encontrado' }); return; }
      const { codigo, descricao, areas } = req.body || {};
      const updated = await problemaRepo.update(id, { codigo, descricao });
      if (Array.isArray(areas)) {
        await problemaRepo.replaceAreas(id, areas);
      }
      const result = { ...updated, areas: await problemaRepo.getAreas(id) };
      res.json(result);
    });

    // DELETE /api/problemas/:id — Deletar problema
    app.delete('/api/problemas/:id', async (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const existing = await problemaRepo.getById(id);
      if (!existing) { res.status(404).json({ error: 'Problema não encontrado' }); return; }
      await problemaRepo.delete(id);
      res.json({ success: true });
    });

    // PUT /api/problemas/:id/areas — Salvar grid de áreas do problema
    app.put('/api/problemas/:id/areas', async (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const existing = await problemaRepo.getById(id);
      if (!existing) { res.status(404).json({ error: 'Problema não encontrado' }); return; }
      const { areas } = req.body || {};
      if (!Array.isArray(areas)) {
        res.status(400).json({ error: 'Body deve conter array "areas" com { areaCodigo, ordem }' });
        return;
      }
      await problemaRepo.replaceAreas(id, areas);
      const result = await problemaRepo.getAreas(id);
      res.json(result);
    });
  }

  // === User Permissions Routes ===

  if (deps.userPermissionRepository) {
    const permRepo = deps.userPermissionRepository;

    // GET /api/users/:id/permissions — Get permissions for a user
    app.get('/api/users/:id/permissions', async (req: Request, res: Response) => {
      const id = parseInt(req.params.id as string, 10);
      if (isNaN(id)) { res.status(400).json({ error: 'ID inválido' }); return; }
      const perms = await permRepo.getByUser(id);
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
  app.get('/api/contato-log', async (req: Request, res: Response) => {
    if (!deps.db) { res.json([]); return; }
    const dataFilter = req.query.data as string | undefined;
    const areaFilter = req.query.areaCodigo as string | undefined;
    try {
      let sql = 'SELECT * FROM contato_log WHERE 1=1';
      const params: any[] = [];
      let idx = 1;
      if (dataFilter) { sql += ` AND data = $${idx++}`; params.push(dataFilter); }
      if (areaFilter) { sql += ` AND area_codigo = $${idx++}`; params.push(areaFilter); }
      sql += ' ORDER BY data DESC, hora DESC LIMIT 500';
      const rows = (await deps.db.query(sql, params)).rows;
      res.json(rows);
    } catch { res.json([]); }
  });

  return app;
}
