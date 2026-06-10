import { v4 as uuidv4 } from 'uuid';
import {
  ActiveIncident,
  IncidentRecord,
  EscalationChainMember,
  EscalationEvent,
} from '../../shared/types';
import { IncidentRepository } from '../database/repositories/IncidentRepository';
import { EscalationChainRepository } from '../database/repositories/EscalationChainRepository';
import { ScheduleManager } from './schedule-manager';

const ESCALATION_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes

export interface EscalationTimer {
  incidentId: string;
  teamId: string;
  currentLevel: number;
  timer: ReturnType<typeof setTimeout>;
  startedAt: Date;
}

export type EscalationEventCallback = (event: EscalationEvent) => void;

export class EscalationEngine {
  private incidentRepository: IncidentRepository;
  private escalationChainRepository: EscalationChainRepository;
  private scheduleManager: ScheduleManager;
  private activeTimers: Map<string, EscalationTimer> = new Map();
  private eventCallbacks: EscalationEventCallback[] = [];

  constructor(
    incidentRepository: IncidentRepository,
    escalationChainRepository: EscalationChainRepository,
    scheduleManager: ScheduleManager
  ) {
    this.incidentRepository = incidentRepository;
    this.escalationChainRepository = escalationChainRepository;
    this.scheduleManager = scheduleManager;
  }

  startEscalation(incident: {
    monitorId: number;
    monitorName: string;
    teamId: string;
  }): string {
    const onCallPerson = this.scheduleManager.getCurrentOnCall(incident.teamId);
    const personName = onCallPerson?.name ?? 'unknown';

    const id = uuidv4();
    const now = new Date();

    this.incidentRepository.create({
      id,
      monitorId: incident.monitorId,
      monitorName: incident.monitorName,
      teamId: incident.teamId,
      onCallPerson: personName,
      status: 'active',
      startedAt: now,
    });

    const chain = this.escalationChainRepository.getByTeam(incident.teamId);

    if (chain.length === 0) {
      // No escalation chain configured – mark as exhausted immediately
      this.incidentRepository.updateStatus(id, 'escalation_exhausted');
      return id;
    }

    this.startTimer(id, incident.teamId, 0, chain);

    return id;
  }

  acknowledgeIncident(incidentId: string, personId: string): void {
    const existingTimer = this.activeTimers.get(incidentId);
    if (existingTimer) {
      clearTimeout(existingTimer.timer);
      this.activeTimers.delete(incidentId);
    }

    const now = new Date();
    this.incidentRepository.acknowledge(incidentId, personId, now);
  }

  getActiveEscalations(): ActiveIncident[] {
    const activeIncidents = this.incidentRepository.getActive();
    const now = new Date();

    return activeIncidents
      .filter((incident) => incident.status === 'active')
      .map((incident) => {
        const timer = this.activeTimers.get(incident.id);
        let timeUntilNextEscalation = 0;
        let currentEscalationLevel = 0;

        if (timer) {
          currentEscalationLevel = timer.currentLevel;
          const elapsed = now.getTime() - timer.startedAt.getTime();
          timeUntilNextEscalation = Math.max(
            0,
            Math.ceil((ESCALATION_TIMEOUT_MS - elapsed) / 1000)
          );
        }

        return {
          id: incident.id,
          monitorId: incident.monitorId,
          monitorName: incident.monitorName,
          teamId: incident.teamId,
          onCallPerson: incident.onCallPerson,
          startedAt: incident.startedAt,
          currentEscalationLevel,
          timeUntilNextEscalation,
        };
      });
  }

  onEscalationEvent(callback: EscalationEventCallback): void {
    this.eventCallbacks.push(callback);
  }

  /** Stop all active timers (for graceful shutdown) */
  stopAll(): void {
    for (const [, timerEntry] of this.activeTimers) {
      clearTimeout(timerEntry.timer);
    }
    this.activeTimers.clear();
  }

  private startTimer(
    incidentId: string,
    teamId: string,
    currentLevel: number,
    chain: EscalationChainMember[]
  ): void {
    const timer = setTimeout(() => {
      this.handleEscalationTimeout(incidentId, teamId, currentLevel, chain);
    }, ESCALATION_TIMEOUT_MS);

    this.activeTimers.set(incidentId, {
      incidentId,
      teamId,
      currentLevel,
      timer,
      startedAt: new Date(),
    });
  }

  private handleEscalationTimeout(
    incidentId: string,
    teamId: string,
    currentLevel: number,
    chain: EscalationChainMember[]
  ): void {
    this.activeTimers.delete(incidentId);

    const nextLevel = currentLevel + 1;

    if (nextLevel >= chain.length) {
      // Chain exhausted
      this.incidentRepository.updateStatus(incidentId, 'escalation_exhausted');

      const event: EscalationEvent = {
        incidentId,
        fromPerson: chain[currentLevel].personName,
        toPerson: 'none',
        escalationLevel: nextLevel,
        createdAt: new Date(),
      };
      this.emitEvent(event);
      return;
    }

    const fromPerson = chain[currentLevel].personName;
    const toPerson = chain[nextLevel].personName;

    // Record escalation event in database
    this.incidentRepository.createEscalationEvent({
      incidentId,
      fromPerson,
      toPerson,
      escalationLevel: nextLevel,
    });

    const event: EscalationEvent = {
      incidentId,
      fromPerson,
      toPerson,
      escalationLevel: nextLevel,
      createdAt: new Date(),
    };
    this.emitEvent(event);

    // Start timer for next level
    this.startTimer(incidentId, teamId, nextLevel, chain);
  }

  private emitEvent(event: EscalationEvent): void {
    for (const callback of this.eventCallbacks) {
      callback(event);
    }
  }
}
