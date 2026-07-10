// Command Center Datadog - Backend entry point
// Initializes database, services, polling, WebSocket, and Express server

import 'dotenv/config';
import http from 'http';
import { client, v1 } from '@datadog/datadog-api-client';
import { initializeDatabase } from './database/init';
import {
  MonitorMappingRepository,
  MonitorAreaMappingRepository,
  TeamRepository,
  ScheduleRepository,
  EscalationChainRepository,
  AreaEscalationChainRepository,
  IncidentRepository,
  UserRepository,
  AreaRepository,
  PeriodoRepository,
  EscalaRepository,
  UserAreaRepository,
  ProblemaRepository,
  UserPermissionRepository,
} from './database/repositories';
import { DatadogPollingService, DatadogClient } from './services/datadog-polling';
import { EscalationEngine } from './services/escalation-engine';
import { ScheduleManager } from './services/schedule-manager';
import { MonitorMappingService } from './services/monitor-mapping';
import { IncidentHistoryService } from './services/incident-history';
import { CSVProcessor } from './services/csv-processor';
import { AuthService } from './services/auth';
import { runDeduplication } from './services/area-migration';
import { CommandCenterWebSocket } from './websocket';
import { createServer } from './server';
import { MonitorState } from '../shared/types';

// === Configuration ===
const PORT = parseInt(process.env.PORT || '3000', 10);
const DATADOG_API_KEY = process.env.DATADOG_API_KEY || '';
const DATADOG_APP_KEY = process.env.DATADOG_APP_KEY || '';
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('[CommandCenter] FATAL: JWT_SECRET environment variable is required');
  process.exit(1);
}

if (!DATADOG_API_KEY || !DATADOG_APP_KEY) {
  console.warn('[CommandCenter] WARNING: DATADOG_API_KEY or DATADOG_APP_KEY not set — polling will fail');
}

// === Create Datadog API Client ===
function createDatadogClient(): DatadogClient {
  const configuration = client.createConfiguration({
    authMethods: {
      apiKeyAuth: DATADOG_API_KEY,
      appKeyAuth: DATADOG_APP_KEY,
    },
  });
  const monitorsApi = new v1.MonitorsApi(configuration);

  return {
    async listMonitors() {
      const monitors = await monitorsApi.listMonitors();
      return monitors.map((m) => ({
        id: m.id ?? 0,
        name: m.name ?? '',
        overall_state: m.overallState as string | undefined,
      }));
    },
    async getMonitorDetails(monitorId: number) {
      try {
        const monitor = await monitorsApi.getMonitor({ monitorId });
        return {
          id: monitor.id ?? monitorId,
          name: monitor.name ?? '',
          message: monitor.message ?? '',
          query: monitor.query ?? '',
          type: monitor.type as string ?? '',
          tags: (monitor.tags ?? []) as string[],
          overall_state: monitor.overallState as string | undefined,
        };
      } catch {
        return null;
      }
    },
  };
}

// === Bootstrap ===
async function main(): Promise<void> {
  console.log('[CommandCenter] Starting backend...');

  // 1. Initialize SQLite database
  const db = initializeDatabase();
  console.log('[CommandCenter] Database initialized');

  // 1.1 Run area deduplication migration
  const migrationResult = runDeduplication(db);
  console.log(
    `[Migration] Area deduplication complete: ${migrationResult.duplicatesFound} duplicates found, ` +
    `${migrationResult.duplicatesRemoved} removed, ${migrationResult.referencesReassigned} references reassigned`
  );

  // 2. Create repository instances
  const monitorMappingRepository = new MonitorMappingRepository(db);
  const monitorAreaMappingRepository = new MonitorAreaMappingRepository(db);
  const teamRepository = new TeamRepository(db);
  const scheduleRepository = new ScheduleRepository(db);
  const escalationChainRepository = new EscalationChainRepository(db);
  const areaEscalationChainRepository = new AreaEscalationChainRepository(db);
  const incidentRepository = new IncidentRepository(db);
  const userRepository = new UserRepository(db);
  const areaRepository = new AreaRepository(db);
  const periodoRepository = new PeriodoRepository(db);
  const escalaRepository = new EscalaRepository(db);
  const userAreaRepository = new UserAreaRepository(db);
  const problemaRepository = new ProblemaRepository(db);
  const userPermissionRepository = new UserPermissionRepository(db);

  // 2.5 Seed default admin if missing
  try {
    const adminExists = userRepository.getByUsername('admin');
    if (!adminExists) {
      console.log('[CommandCenter] No admin user found. Creating default admin...');
      const bcrypt = require('bcrypt');
      userRepository.create({
        codigo: 'ADM-001',
        areaCodigo: null,
        areaSolicitada: null,
        nome: 'Administrador do Sistema',
        perfil: 'Adm',
        nivelEscalonamento: null,
        cargo: 'Administrador',
        contato: null,
        username: 'admin',
        senhaHash: bcrypt.hashSync('admin123', 10),
        ativo: true,
        aprovado: true,
      });
      console.log('[CommandCenter] Default admin created: admin / admin123');
    }
  } catch (e) {
    console.error('[CommandCenter] Failed to create default admin:', e);
  }

  // 3. Create service instances
  const scheduleManager = new ScheduleManager(scheduleRepository, escalationChainRepository);
  const monitorMappingService = new MonitorMappingService(monitorMappingRepository);
  const incidentHistoryService = new IncidentHistoryService(incidentRepository);
  const csvProcessor = new CSVProcessor(scheduleRepository);
  const authService = new AuthService(db, JWT_SECRET as string);

  const datadogClient = createDatadogClient();
  const datadogPollingService = new DatadogPollingService(datadogClient);

  const escalationEngine = new EscalationEngine(
    incidentRepository,
    escalationChainRepository,
    scheduleManager
  );

  // 4. Create WebSocket server
  const wsServer = new CommandCenterWebSocket();

  // 5. Wire PollingService → WebSocket (broadcast monitor updates)
  datadogPollingService.onMonitorStateChange((monitor, previousState: MonitorState) => {
    // Broadcast every state change to connected clients
    wsServer.broadcastMonitorsUpdated(datadogPollingService.getMonitors());

    // If monitor enters Alert state, start escalation
    if (monitor.state === 'Alert' && previousState !== 'Alert') {
      const teamId = monitorMappingService.getTeamForMonitor(monitor.id);
      if (teamId) {
        const incidentId = escalationEngine.startEscalation({
          monitorId: monitor.id,
          monitorName: monitor.name,
          teamId,
        });
        // Broadcast new incident
        wsServer.broadcastIncidentNew({
          id: incidentId,
          monitorId: monitor.id,
          monitorName: monitor.name,
          teamId,
        });
      }
    }

    // If monitor returns to OK from Alert, broadcast resolution
    if (monitor.state === 'OK' && previousState === 'Alert') {
      wsServer.broadcastIncidentResolved({
        monitorId: monitor.id,
        monitorName: monitor.name,
        resolvedAt: new Date().toISOString(),
      });
    }
  });

  // 6. Wire EscalationEngine → WebSocket (broadcast escalation events)
  escalationEngine.onEscalationEvent((event) => {
    wsServer.broadcastIncidentEscalated(event);
  });

  // 7. Create Express app with routes
  const app = createServer({
    datadogPollingService,
    escalationEngine,
    scheduleManager,
    monitorMappingService,
    incidentHistoryService,
    csvProcessor,
    teamRepository,
    authService,
    userRepository,
    areaRepository,
    periodoRepository,
    escalaRepository,
    areaEscalationChainRepository,
    monitorAreaMappingRepository,
    userAreaRepository,
    problemaRepository,
    userPermissionRepository,
    db,
  });

  // 7.5 — Cleanup corrupted data on startup (one-time data hygiene)
  try {
    const { isReadableText } = require('./services/escalation-csv-processor');
    let cleanedUsers = 0, cleanedAreas = 0, cleanedSchedules = 0;

    db.pragma('foreign_keys = OFF');

    // Clean corrupted users
    const allUsers = userRepository.getAll();
    for (const user of allUsers) {
      if (!isReadableText(user.nome) || !isReadableText(user.username)) {
        try { userRepository.delete(user.id); cleanedUsers++; } catch { /* skip */ }
      }
    }

    // Clean corrupted areas
    const allAreas = areaRepository.getAll();
    for (const area of allAreas) {
      if (!isReadableText(area.nome) || !isReadableText(area.codigo)) {
        try { db.prepare('DELETE FROM areas WHERE id = ?').run(area.id); cleanedAreas++; } catch { /* skip */ }
      }
    }

    // Clean corrupted escalation schedules
    try {
      const schedules = db.prepare('SELECT id, area, colaborador FROM escalation_schedules').all() as any[];
      for (const sched of schedules) {
        if (!isReadableText(sched.area) || !isReadableText(sched.colaborador)) {
          db.prepare('DELETE FROM escalation_schedules WHERE id = ?').run(sched.id);
          cleanedSchedules++;
        }
      }
    } catch { /* table may not exist */ }

    db.pragma('foreign_keys = ON');

    if (cleanedUsers || cleanedAreas || cleanedSchedules) {
      console.log(`[CommandCenter] Cleanup: removed ${cleanedUsers} corrupted users, ${cleanedAreas} areas, ${cleanedSchedules} schedules`);
    }
  } catch (e) {
    console.log('[CommandCenter] Cleanup skipped:', (e as any).message);
  }

  // 8. Create HTTP server and attach WebSocket
  const httpServer = http.createServer(app);
  wsServer.attach(httpServer);

  // 9. Start polling
  datadogPollingService.start();
  console.log('[CommandCenter] Datadog polling started (30s interval)');

  // 10. Start HTTP server
  httpServer.listen(PORT, () => {
    console.log(`[CommandCenter] Server listening on port ${PORT}`);
    console.log(`[CommandCenter] WebSocket available on ws://localhost:${PORT}`);
  });

  // === Graceful shutdown ===
  const shutdown = () => {
    console.log('[CommandCenter] Shutting down gracefully...');

    // Stop polling first
    datadogPollingService.stop();
    console.log('[CommandCenter] Polling stopped');

    // Stop escalation timers
    escalationEngine.stopAll();
    console.log('[CommandCenter] Escalation timers stopped');

    // Close WebSocket connections
    wsServer.close();
    console.log('[CommandCenter] WebSocket connections closed');

    // Close HTTP server
    httpServer.close(() => {
      console.log('[CommandCenter] HTTP server closed');

      // Close database
      db.close();
      console.log('[CommandCenter] Database connection closed');

      process.exit(0);
    });

    // Force exit after 10 seconds if graceful shutdown stalls
    setTimeout(() => {
      console.error('[CommandCenter] Forced shutdown after timeout');
      process.exit(1);
    }, 10_000);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('[CommandCenter] Fatal error during startup:', error);
  process.exit(1);
});
