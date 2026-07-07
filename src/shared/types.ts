// Command Center Datadog - Shared Types and Interfaces

// === Monitor Types ===

/** Estado do monitor Datadog */
export type MonitorState = 'OK' | 'Alert' | 'Warn' | 'No Data' | 'Unknown';

export interface Monitor {
  id: number;
  name: string;
  state: MonitorState;
  teamId: string | null;
  lastUpdated: Date;
}

// === Team Types ===

export interface TeamPanel {
  teamId: string;
  teamName: string;
  currentOnCall: OnCallPerson | null;
  shiftStart: string;
  shiftEnd: string;
  monitors: Monitor[];
  activeIncidents: ActiveIncident[];
  escalationChainConfigured: boolean;
}

export interface OnCallPerson {
  name: string;
  contact: string | null;
}

// === Schedule Types ===

export interface ScheduleEntry {
  teamId: string;
  personName: string;
  personContact?: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string; // HH:mm
}

// === Escalation Types ===

export interface EscalationChainMember {
  personName: string;
  personContact?: string;
  position: number;
}

export interface ActiveIncident {
  id: string;
  monitorId: number;
  monitorName: string;
  teamId: string;
  onCallPerson: string;
  startedAt: Date;
  currentEscalationLevel: number;
  timeUntilNextEscalation: number; // seconds remaining
}

// === Incident Types ===

export interface IncidentRecord {
  id: string;
  monitorId: number;
  monitorName: string;
  teamId: string;
  onCallPerson: string;
  status: 'active' | 'acknowledged' | 'resolved' | 'escalation_exhausted';
  startedAt: Date;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  resolvedAt?: Date;
  resolvedBy?: string;
}

export interface EscalationEvent {
  incidentId: string;
  fromPerson: string;
  toPerson: string;
  escalationLevel: number;
  createdAt: Date;
}

// === CSV Types ===

export interface CSVValidationError {
  line: number;
  column: string;
  message: string;
}

export interface ScheduleConflict {
  teamId: string;
  date: string;
  conflictingEntries: ScheduleEntry[];
}

export interface CSVValidationResult {
  isValid: boolean;
  validEntries: ScheduleEntry[];
  errors: CSVValidationError[];
  conflicts: ScheduleConflict[];
}

// === History Types ===

export interface HistoryFilters {
  teamId?: string;
  startDate?: string;
  endDate?: string;
  status?: IncidentRecord['status'];
}

// === Import Types ===

export interface ImportResult {
  success: boolean;
  importedCount: number;
  teamId: string;
  replacedPrevious: boolean;
}

// === Connection Types ===

export type ConnectionStatus = 'connected' | 'disconnected' | 'reconnecting';

// === Monitor Mapping Types ===

export interface MonitorMapping {
  monitorId: number;
  teamId: string;
  monitorName: string;
  createdAt: string;
  updatedAt: string;
}

/** Monitor-to-area mapping (area-based, replaces team-based for new workflow) */
export interface MonitorAreaMapping {
  monitorId: number;
  areaCodigo: string;
  monitorName: string;
  createdAt: string;
  updatedAt: string;
}

// === Escalation Record Types ===

export interface EscalationRecord {
  fromPerson: string;
  toPerson: string;
  escalationLevel: number;
  createdAt: Date;
}

export interface ResolutionRecord {
  resolvedBy: string;
  resolvedAt: Date;
}

// === User/Area/Periodo/Escala Types (Modelo Físico) ===

/** Perfil de usuário do sistema */
export type UserPerfil = 'Adm' | 'Responsavel' | 'Plantonista' | 'Consultor';

/** Tb_Areas - Áreas de responsabilidade */
export interface Area {
  id: number;
  codigo: string;
  nome: string;
  torre: string | null;
  coordenadorNome: string | null;
  coordenadorContato: string | null;
  gerenteNome: string | null;
  gerenteContato: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Tb_Usuario - Usuários do sistema */
export interface User {
  id: number;
  codigo: string;
  areaCodigo: string | null;
  areaSolicitada: string | null;
  nome: string;
  perfil: UserPerfil;
  nivelEscalonamento: string | null;
  cargo: string | null;
  contato?: string | null;
  username: string;
  senhaHash: string;
  ativo: boolean;
  aprovado: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Permissão granular por menu */
export interface UserPermission {
  id: number;
  userId: number;
  menu: string;
  canRead: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

/** Tb_Periodos - Períodos de plantão por área */
export interface Periodo {
  id: number;
  codigo: string;
  data: string;
  horarios: string;
  areaCodigo: string;
  createdAt: string;
  updatedAt: string;
}

/** Tb_Escalas - Escalas vinculando área + período + usuário */
export interface Escala {
  id: number;
  codigo: string;
  areaCodigo: string;
  periodoCodigo: string;
  usuarioCodigo: string;
  createdAt: string;
  updatedAt: string;
}

// === Auth Types ===

/** Authenticated user info stored in the frontend */
export interface AuthUser {
  id: number;
  nome: string;
  perfil: UserPerfil;
  areaCodigo: string | null;
  username: string;
}

/** Available views for simple client-side routing */
export type AppView =
  | 'login'
  | 'register'
  | 'area-selector'
  | 'setup-wizard'
  | 'dashboard'
  | 'csv-import'
  | 'incident-history'
  | 'monitor-mapping'
  | 'escalation-config'
  | 'area-management'
  | 'team-management'
  | 'plantonist-management'
  | 'periodo-management'
  | 'escala-management'
  | 'calendar-view';

// === Zustand Store Types ===

export interface CommandCenterStore {
  // Existing state
  monitors: Monitor[];
  teams: TeamPanel[];
  activeIncidents: ActiveIncident[];
  connectionStatus: ConnectionStatus;

  // Auth state
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  currentView: AppView;

  // Area selection state
  selectedAreas: string[];

  // Existing actions
  setMonitors(monitors: Monitor[]): void;
  setConnectionStatus(status: ConnectionStatus): void;
  updateTeamPanel(teamId: string, data: Partial<TeamPanel>): void;

  // Auth actions
  login(token: string, user: AuthUser): void;
  logout(): void;
  setCurrentView(view: AppView): void;

  // Area selection actions
  setSelectedAreas(areas: string[]): void;
}
