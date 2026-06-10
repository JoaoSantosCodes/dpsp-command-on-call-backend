import { Monitor, MonitorState } from '../../shared/types';

/**
 * Interface for the Datadog API client dependency injection.
 * Allows mocking for testability.
 */
export interface DatadogClient {
  listMonitors(): Promise<Array<{ id: number; name: string; overall_state?: string }>>;
  getMonitorDetails?(monitorId: number): Promise<{ id: number; name: string; message?: string; query?: string; type?: string; tags?: string[]; overall_state?: string } | null>;
}

type MonitorStateChangeCallback = (monitor: Monitor, previousState: MonitorState) => void;

/**
 * Maps Datadog API overall_state string to our MonitorState type.
 */
function mapOverallState(overallState: string | undefined): MonitorState {
  switch (overallState) {
    case 'Alert':
      return 'Alert';
    case 'OK':
      return 'OK';
    case 'Warn':
      return 'Warn';
    case 'No Data':
      return 'No Data';
    default:
      return 'Unknown';
  }
}

export class DatadogPollingService {
  private client: DatadogClient;
  private monitors: Monitor[] = [];
  private previousStates: Map<number, MonitorState> = new Map();
  private callbacks: MonitorStateChangeCallback[] = [];
  private _isRunning = false;
  private currentBackoff = 30_000; // initial backoff: 30s
  private readonly baseInterval = 30_000; // 30 seconds polling
  private readonly maxBackoff = 300_000; // max 5 minutes
  private pollTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(client: DatadogClient) {
    this.client = client;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  start(): void {
    if (this._isRunning) return;
    this._isRunning = true;
    this.currentBackoff = this.baseInterval;
    this.schedulePoll();
  }

  stop(): void {
    if (!this._isRunning) return;
    this._isRunning = false;
    if (this.pollTimeoutId !== null) {
      clearTimeout(this.pollTimeoutId);
      this.pollTimeoutId = null;
    }
  }

  getMonitors(): Monitor[] {
    return [...this.monitors];
  }

  onMonitorStateChange(callback: MonitorStateChangeCallback): void {
    this.callbacks.push(callback);
  }

  private schedulePoll(): void {
    this.poll().then(() => {
      // After poll completes, schedule next one
      this.scheduleNext();
    });
  }

  private scheduleNext(): void {
    if (!this._isRunning) return;

    this.pollTimeoutId = setTimeout(() => {
      if (this._isRunning) {
        this.schedulePoll();
      }
    }, this.currentBackoff);
  }

  private async poll(): Promise<void> {
    try {
      // Timeout de 30s para evitar hang indefinido
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Datadog API timeout (30s)')), 30_000)
      );

      const rawMonitors = await Promise.race([
        this.client.listMonitors(),
        timeoutPromise,
      ]);

      const newMonitors: Monitor[] = rawMonitors.map((raw) => ({
        id: raw.id,
        name: raw.name,
        state: mapOverallState(raw.overall_state),
        teamId: null,
        lastUpdated: new Date(),
      }));

      this.detectStateChanges(newMonitors);
      this.monitors = newMonitors;

      // Reset backoff on successful poll
      this.currentBackoff = this.baseInterval;
    } catch (error) {
      // On failure: maintain previous state, increase backoff
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(`[DatadogPolling] Poll failed: ${errMsg} — next retry in ${this.currentBackoff / 1000}s`);
      this.currentBackoff = Math.min(this.currentBackoff * 2, this.maxBackoff);
    }
  }

  private detectStateChanges(newMonitors: Monitor[]): void {
    for (const monitor of newMonitors) {
      const previousState = this.previousStates.get(monitor.id);

      if (previousState !== undefined && previousState !== monitor.state) {
        for (const callback of this.callbacks) {
          callback(monitor, previousState);
        }
      }

      this.previousStates.set(monitor.id, monitor.state);
    }
  }
}
