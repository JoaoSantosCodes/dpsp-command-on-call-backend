import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer, Server as HttpServer } from 'http';
import { WebSocket } from 'ws';
import { CommandCenterWebSocket } from './websocket';

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) {
      resolve();
      return;
    }
    ws.on('open', () => resolve());
    ws.on('error', (err) => reject(err));
  });
}

function waitForMessage(ws: WebSocket): Promise<string> {
  return new Promise((resolve) => {
    ws.once('message', (data) => {
      resolve(data.toString());
    });
  });
}

function waitForClose(ws: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (ws.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    ws.on('close', () => resolve());
  });
}

describe('CommandCenterWebSocket', () => {
  let httpServer: HttpServer;
  let wsServer: CommandCenterWebSocket;
  let port: number;
  let clients: WebSocket[];

  beforeEach(async () => {
    clients = [];
    wsServer = new CommandCenterWebSocket();
    httpServer = createServer();
    wsServer.attach(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(0, () => {
        const address = httpServer.address();
        port = typeof address === 'object' && address ? address.port : 0;
        resolve();
      });
    });
  });

  afterEach(async () => {
    // Close all test clients
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN || client.readyState === WebSocket.CONNECTING) {
        client.close();
      }
    }

    wsServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  });

  function createClient(): WebSocket {
    const ws = new WebSocket(`ws://localhost:${port}`);
    clients.push(ws);
    return ws;
  }

  describe('Client connection tracking', () => {
    it('should track a single connected client', async () => {
      const client = createClient();
      await waitForOpen(client);

      expect(wsServer.getClientCount()).toBe(1);
    });

    it('should track multiple connected clients', async () => {
      const client1 = createClient();
      const client2 = createClient();
      const client3 = createClient();

      await Promise.all([waitForOpen(client1), waitForOpen(client2), waitForOpen(client3)]);

      expect(wsServer.getClientCount()).toBe(3);
    });

    it('should start with zero clients', () => {
      expect(wsServer.getClientCount()).toBe(0);
    });
  });

  describe('Broadcasting to multiple clients', () => {
    it('should broadcast a message to all connected clients', async () => {
      const client1 = createClient();
      const client2 = createClient();
      await Promise.all([waitForOpen(client1), waitForOpen(client2)]);

      const msg1Promise = waitForMessage(client1);
      const msg2Promise = waitForMessage(client2);

      wsServer.broadcast('monitors:updated', { monitors: [{ id: 1, name: 'test' }] });

      const [msg1, msg2] = await Promise.all([msg1Promise, msg2Promise]);
      const parsed1 = JSON.parse(msg1);
      const parsed2 = JSON.parse(msg2);

      expect(parsed1).toEqual({
        type: 'monitors:updated',
        data: { monitors: [{ id: 1, name: 'test' }] },
      });
      expect(parsed2).toEqual(parsed1);
    });

    it('should broadcast incident:new events', async () => {
      const client = createClient();
      await waitForOpen(client);

      const msgPromise = waitForMessage(client);
      wsServer.broadcastIncidentNew({ id: 'inc-1', monitorId: 42 });

      const msg = JSON.parse(await msgPromise);
      expect(msg.type).toBe('incident:new');
      expect(msg.data.incident).toEqual({ id: 'inc-1', monitorId: 42 });
    });

    it('should broadcast incident:escalated events', async () => {
      const client = createClient();
      await waitForOpen(client);

      const msgPromise = waitForMessage(client);
      wsServer.broadcastIncidentEscalated({
        incidentId: 'inc-1',
        fromPerson: 'Alice',
        toPerson: 'Bob',
        escalationLevel: 1,
      });

      const msg = JSON.parse(await msgPromise);
      expect(msg.type).toBe('incident:escalated');
      expect(msg.data.escalation.fromPerson).toBe('Alice');
      expect(msg.data.escalation.toPerson).toBe('Bob');
    });

    it('should broadcast incident:resolved events', async () => {
      const client = createClient();
      await waitForOpen(client);

      const msgPromise = waitForMessage(client);
      wsServer.broadcastIncidentResolved({ id: 'inc-1', resolvedBy: 'Charlie' });

      const msg = JSON.parse(await msgPromise);
      expect(msg.type).toBe('incident:resolved');
      expect(msg.data.incident.resolvedBy).toBe('Charlie');
    });

    it('should broadcast monitors:updated via convenience method', async () => {
      const client = createClient();
      await waitForOpen(client);

      const msgPromise = waitForMessage(client);
      const monitors = [{ id: 1, name: 'CPU High', state: 'Alert' }];
      wsServer.broadcastMonitorsUpdated(monitors);

      const msg = JSON.parse(await msgPromise);
      expect(msg.type).toBe('monitors:updated');
      expect(msg.data.monitors).toEqual(monitors);
    });
  });

  describe('Event format structure', () => {
    it('should send events as JSON with type and data fields', async () => {
      const client = createClient();
      await waitForOpen(client);

      const msgPromise = waitForMessage(client);
      wsServer.broadcast('test:event', { key: 'value' });

      const msg = JSON.parse(await msgPromise);
      expect(msg).toHaveProperty('type');
      expect(msg).toHaveProperty('data');
      expect(msg.type).toBe('test:event');
      expect(msg.data).toEqual({ key: 'value' });
    });

    it('should handle null data', async () => {
      const client = createClient();
      await waitForOpen(client);

      const msgPromise = waitForMessage(client);
      wsServer.broadcast('empty:event', null);

      const msg = JSON.parse(await msgPromise);
      expect(msg.type).toBe('empty:event');
      expect(msg.data).toBeNull();
    });

    it('should handle complex nested data', async () => {
      const client = createClient();
      await waitForOpen(client);

      const complexData = {
        monitors: [
          { id: 1, name: 'test', state: 'Alert', nested: { deep: true } },
        ],
        timestamp: '2024-01-01T00:00:00Z',
      };

      const msgPromise = waitForMessage(client);
      wsServer.broadcast('complex:event', complexData);

      const msg = JSON.parse(await msgPromise);
      expect(msg.data).toEqual(complexData);
    });
  });

  describe('Client disconnection cleanup', () => {
    it('should remove disconnected clients from tracking', async () => {
      const client1 = createClient();
      const client2 = createClient();
      await Promise.all([waitForOpen(client1), waitForOpen(client2)]);

      expect(wsServer.getClientCount()).toBe(2);

      const closePromise = waitForClose(client1);
      client1.close();
      await closePromise;

      // Small delay for server to process the close event
      await new Promise((r) => setTimeout(r, 50));

      expect(wsServer.getClientCount()).toBe(1);
    });

    it('should not broadcast to disconnected clients', async () => {
      const client1 = createClient();
      const client2 = createClient();
      await Promise.all([waitForOpen(client1), waitForOpen(client2)]);

      // Disconnect client1
      const closePromise = waitForClose(client1);
      client1.close();
      await closePromise;
      await new Promise((r) => setTimeout(r, 50));

      // Broadcast should only reach client2
      const msg2Promise = waitForMessage(client2);
      wsServer.broadcast('test:event', { value: 1 });

      const msg2 = JSON.parse(await msg2Promise);
      expect(msg2.type).toBe('test:event');
    });

    it('should handle close() gracefully with active clients', async () => {
      const client1 = createClient();
      const client2 = createClient();
      await Promise.all([waitForOpen(client1), waitForOpen(client2)]);

      expect(wsServer.getClientCount()).toBe(2);

      wsServer.close();

      expect(wsServer.getClientCount()).toBe(0);
    });
  });
});
