import { OnCallPerson, EscalationChainMember } from '../../shared/types';
import { ScheduleRepository } from '../database/repositories/ScheduleRepository';
import { EscalationChainRepository } from '../database/repositories/EscalationChainRepository';

export class ScheduleManager {
  private scheduleRepository: ScheduleRepository;
  private escalationChainRepository: EscalationChainRepository;
  private getNow: () => Date;

  constructor(
    scheduleRepository: ScheduleRepository,
    escalationChainRepository: EscalationChainRepository,
    getNow?: () => Date
  ) {
    this.scheduleRepository = scheduleRepository;
    this.escalationChainRepository = escalationChainRepository;
    this.getNow = getNow || (() => new Date());
  }

  getCurrentOnCall(teamId: string): OnCallPerson | null {
    const now = this.getNow();

    const date = this.formatDate(now);
    const time = this.formatTime(now);

    const entry = this.scheduleRepository.getByTeamAndDateTime(teamId, date, time);

    if (!entry) {
      return null;
    }

    return {
      name: entry.personName,
      contact: entry.personContact || null,
    };
  }

  getEscalationChain(teamId: string): EscalationChainMember[] {
    return this.escalationChainRepository.getByTeam(teamId);
  }

  updateEscalationChain(teamId: string, chain: EscalationChainMember[]): void {
    this.escalationChainRepository.replaceChain(teamId, chain);
  }

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private formatTime(date: Date): string {
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}
