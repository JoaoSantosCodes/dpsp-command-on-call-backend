import { WebSocketServer, WebSocket } from 'ws';
import { Server as HttpServer } from 'http';

export interface WebSocketEvent {
  type: string;
  data: unknown;
}

export class CommandCenterWebSocket {
  private wss: WebSocketServer | null = null;
  private clients: Set<WebSocket> = new Set();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private readonly HEARTBEAT_INTERVAL_MS = 30_000;

  /**
   * Attach WebSocket server to an existing HTTP server.
   */
  attach(server: HttpServer): void {
    this.wss = new WebSocketServer({ server });

    this.wss.on('connection', (ws: WebSocket) => {
      this.clients.add(ws);

      ws.on('close', () => {
        this.clients.delete(ws);
      });

      ws.on('error', () => {
        this.clients.delete(ws);
      });

      // Respond to pong for heartbeat
      ws.on('pong', () => {
        (ws as any).__alive = true;
      });

      (ws as any).__alive = true;
    });

    this.startHeartbeat();
  }

  /**
   * Broadcast an event to all connected clients.
   * Disconnected or errored clients are cleaned up automatically.
   */
  broadcast(type: string, data: unknown): void {
    const message = JSON.stringify({ type, data } as WebSocketEvent);

    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(message);
        } catch (err) {
          console.error(`[WebSocket] Error sending message to client: ${err instanceof Error ? err.message : err}`);
          this.clients.delete(client);
        }
      } else {
        // Clean up clients that are no longer open
        this.clients.delete(client);
      }
    }
  }

  /**
   * Emit monitors:updated event with current monitor data.
   */
  broadcastMonitorsUpdated(monitors: unknown[]): void {
    this.broadcast('monitors:updated', { monitors });
  }

  /**
   * Emit incident:new event when an incident is created.
   */
  broadcastIncidentNew(incident: unknown): void {
    this.broadcast('incident:new', { incident });
  }

  /**
   * Emit incident:escalated event when escalation occurs.
   */
  broadcastIncidentEscalated(escalation: unknown): void {
    this.broadcast('incident:escalated', { escalation });
  }

  /**
   * Emit incident:resolved event when an incident is resolved.
   */
  broadcastIncidentResolved(incident: unknown): void {
    this.broadcast('incident:resolved', { incident });
  }

  /**
   * Get the current number of connected clients.
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Gracefully close all connections and stop the server.
   */
  close(): void {
    this.stopHeartbeat();

    for (const client of this.clients) {
      client.close();
    }
    this.clients.clear();

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
  }

  /**
   * Start heartbeat ping/pong to detect stale connections.
   * Clients that don't respond to ping within the interval are terminated.
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const client of this.clients) {
        if ((client as any).__alive === false) {
          client.terminate();
          this.clients.delete(client);
          continue;
        }

        (client as any).__alive = false;
        client.ping();
      }
    }, this.HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
