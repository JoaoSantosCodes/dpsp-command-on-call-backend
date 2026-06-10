import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatadogPollingService, DatadogClient } from './datadog-polling';
import { MonitorState } from '../../shared/types';

function createMockClient(
  monitors: Array<{ id: number; name: string; overall_state?: string }> = []
): DatadogClient {
  return {
    listMonitors: vi.fn().mockResolvedValue(monitors),
  };
}

describe('DatadogPollingService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('start/stop', () => {
    it('should set isRunning to true when started', () => {
      const client = createMockClient();
      const service = new DatadogPollingService(client);

      service.start();
      expect(service.isRunning).toBe(true);
      service.stop();
    });

    it('should set isRunning to false when stopped', () => {
      const client = createMockClient();
      const service = new DatadogPollingService(client);

      service.start();
      service.stop();
      expect(service.isRunning).toBe(false);
    });

    it('should not start multiple intervals if start is called twice', () => {
      const client = createMockClient();
      const service = new DatadogPollingService(client);

      service.start();
      service.start();
      expect(service.isRunning).toBe(true);
      service.stop();
    });

    it('should poll immediately on start', async () => {
      const client = createMockClient([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }]);
      const service = new DatadogPollingService(client);

      service.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(client.listMonitors).toHaveBeenCalledTimes(1);
      service.stop();
    });

    it('should poll every 30 seconds', async () => {
      const client = createMockClient([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }]);
      const service = new DatadogPollingService(client);

      service.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(client.listMonitors).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(client.listMonitors).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(30_000);
      expect(client.listMonitors).toHaveBeenCalledTimes(3);

      service.stop();
    });

    it('should stop polling when stopped', async () => {
      const client = createMockClient([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }]);
      const service = new DatadogPollingService(client);

      service.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(client.listMonitors).toHaveBeenCalledTimes(1);

      service.stop();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(client.listMonitors).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMonitors', () => {
    it('should return empty array before first poll', () => {
      const client = createMockClient();
      const service = new DatadogPollingService(client);

      expect(service.getMonitors()).toEqual([]);
    });

    it('should return fetched monitors after poll', async () => {
      const client = createMockClient([
        { id: 1, name: 'Monitor 1', overall_state: 'OK' },
        { id: 2, name: 'Monitor 2', overall_state: 'Alert' },
      ]);
      const service = new DatadogPollingService(client);

      service.start();
      await vi.advanceTimersByTimeAsync(0);

      const monitors = service.getMonitors();
      expect(monitors).toHaveLength(2);
      expect(monitors[0].id).toBe(1);
      expect(monitors[0].name).toBe('Monitor 1');
      expect(monitors[0].state).toBe('OK');
      expect(monitors[0].teamId).toBeNull();
      expect(monitors[1].id).toBe(2);
      expect(monitors[1].state).toBe('Alert');

      service.stop();
    });

    it('should return a copy of monitors (not mutable reference)', async () => {
      const client = createMockClient([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }]);
      const service = new DatadogPollingService(client);

      service.start();
      await vi.advanceTimersByTimeAsync(0);

      const monitors1 = service.getMonitors();
      const monitors2 = service.getMonitors();
      expect(monitors1).not.toBe(monitors2);
      expect(monitors1).toEqual(monitors2);

      service.stop();
    });
  });

  describe('state mapping', () => {
    it.each([
      ['Alert', 'Alert'],
      ['OK', 'OK'],
      ['Warn', 'Warn'],
      ['No Data', 'No Data'],
      [undefined, 'Unknown'],
      ['SomethingElse', 'Unknown'],
    ] as [string | undefined, MonitorState][])(
      'should map overall_state "%s" to MonitorState "%s"',
      async (apiState, expectedState) => {
        const client = createMockClient([{ id: 1, name: 'Test', overall_state: apiState }]);
        const service = new DatadogPollingService(client);

        service.start();
        await vi.advanceTimersByTimeAsync(0);

        const monitors = service.getMonitors();
        expect(monitors[0].state).toBe(expectedState);

        service.stop();
      }
    );
  });

  describe('state change detection', () => {
    it('should not fire callback on first poll (no previous state)', async () => {
      const client = createMockClient([{ id: 1, name: 'Monitor 1', overall_state: 'Alert' }]);
      const service = new DatadogPollingService(client);
      const callback = vi.fn();

      service.onMonitorStateChange(callback);
      service.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(callback).not.toHaveBeenCalled();
      service.stop();
    });

    it('should fire callback when monitor state changes', async () => {
      const mockListMonitors = vi
        .fn()
        .mockResolvedValueOnce([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }])
        .mockResolvedValueOnce([{ id: 1, name: 'Monitor 1', overall_state: 'Alert' }]);

      const client: DatadogClient = { listMonitors: mockListMonitors };
      const service = new DatadogPollingService(client);
      const callback = vi.fn();

      service.onMonitorStateChange(callback);
      service.start();

      // First poll - establishes baseline
      await vi.advanceTimersByTimeAsync(0);
      expect(callback).not.toHaveBeenCalled();

      // Second poll - state changes from OK to Alert
      await vi.advanceTimersByTimeAsync(30_000);
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, state: 'Alert' }),
        'OK'
      );

      service.stop();
    });

    it('should not fire callback when monitor state stays the same', async () => {
      const mockListMonitors = vi
        .fn()
        .mockResolvedValueOnce([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }])
        .mockResolvedValueOnce([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }]);

      const client: DatadogClient = { listMonitors: mockListMonitors };
      const service = new DatadogPollingService(client);
      const callback = vi.fn();

      service.onMonitorStateChange(callback);
      service.start();

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);

      expect(callback).not.toHaveBeenCalled();
      service.stop();
    });

    it('should support multiple callbacks', async () => {
      const mockListMonitors = vi
        .fn()
        .mockResolvedValueOnce([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }])
        .mockResolvedValueOnce([{ id: 1, name: 'Monitor 1', overall_state: 'Alert' }]);

      const client: DatadogClient = { listMonitors: mockListMonitors };
      const service = new DatadogPollingService(client);
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      service.onMonitorStateChange(callback1);
      service.onMonitorStateChange(callback2);
      service.start();

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);

      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);

      service.stop();
    });

    it('should detect state changes for multiple monitors independently', async () => {
      const mockListMonitors = vi
        .fn()
        .mockResolvedValueOnce([
          { id: 1, name: 'Monitor 1', overall_state: 'OK' },
          { id: 2, name: 'Monitor 2', overall_state: 'OK' },
        ])
        .mockResolvedValueOnce([
          { id: 1, name: 'Monitor 1', overall_state: 'Alert' },
          { id: 2, name: 'Monitor 2', overall_state: 'OK' }, // no change
        ]);

      const client: DatadogClient = { listMonitors: mockListMonitors };
      const service = new DatadogPollingService(client);
      const callback = vi.fn();

      service.onMonitorStateChange(callback);
      service.start();

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, state: 'Alert' }),
        'OK'
      );

      service.stop();
    });
  });

  describe('retry with exponential backoff', () => {
    it('should maintain previous monitors on API failure', async () => {
      const mockListMonitors = vi
        .fn()
        .mockResolvedValueOnce([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }])
        .mockRejectedValueOnce(new Error('Connection failed'));

      const client: DatadogClient = { listMonitors: mockListMonitors };
      const service = new DatadogPollingService(client);

      service.start();
      await vi.advanceTimersByTimeAsync(0);

      expect(service.getMonitors()).toHaveLength(1);

      // Trigger next poll (after 30s) which fails
      await vi.advanceTimersByTimeAsync(30_000);

      // Monitors should still be available
      expect(service.getMonitors()).toHaveLength(1);
      expect(service.getMonitors()[0].state).toBe('OK');

      service.stop();
    });

    it('should retry with exponential backoff on failure', async () => {
      const mockListMonitors = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail 1'))
        .mockRejectedValueOnce(new Error('Fail 2'))
        .mockResolvedValueOnce([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }]);

      const client: DatadogClient = { listMonitors: mockListMonitors };
      const service = new DatadogPollingService(client);

      service.start();

      // First call (immediate poll) fails, backoff becomes 60s
      await vi.advanceTimersByTimeAsync(0);
      expect(mockListMonitors).toHaveBeenCalledTimes(1);

      // Retry after 60s (30s * 2), fails again, backoff becomes 120s
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockListMonitors).toHaveBeenCalledTimes(2);

      // Retry after 120s (60s * 2), succeeds
      await vi.advanceTimersByTimeAsync(120_000);
      expect(mockListMonitors).toHaveBeenCalledTimes(3);

      service.stop();
    });

    it('should cap backoff at 5 minutes (300s)', async () => {
      const mockListMonitors = vi
        .fn()
        .mockRejectedValue(new Error('Always fail'));

      const client: DatadogClient = { listMonitors: mockListMonitors };
      const service = new DatadogPollingService(client);

      service.start();

      // Initial poll fails, backoff = 60s
      await vi.advanceTimersByTimeAsync(0);
      expect(mockListMonitors).toHaveBeenCalledTimes(1);

      // Retry after 60s, fails, backoff = 120s
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockListMonitors).toHaveBeenCalledTimes(2);

      // Retry after 120s, fails, backoff = 240s
      await vi.advanceTimersByTimeAsync(120_000);
      expect(mockListMonitors).toHaveBeenCalledTimes(3);

      // Retry after 240s, fails, backoff = 300s (capped, not 480s)
      await vi.advanceTimersByTimeAsync(240_000);
      expect(mockListMonitors).toHaveBeenCalledTimes(4);

      // Retry after 300s (capped), fails
      await vi.advanceTimersByTimeAsync(300_000);
      expect(mockListMonitors).toHaveBeenCalledTimes(5);

      // Next one should also be 300s (capped)
      await vi.advanceTimersByTimeAsync(300_000);
      expect(mockListMonitors).toHaveBeenCalledTimes(6);

      service.stop();
    });

    it('should reset backoff after successful poll', async () => {
      const mockListMonitors = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail'))       // poll 1: fail, backoff -> 60s
        .mockResolvedValueOnce([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }]) // poll 2: success, backoff -> 30s
        .mockRejectedValueOnce(new Error('Fail again')) // poll 3: fail, backoff -> 60s (reset!)
        .mockResolvedValueOnce([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }]); // poll 4: success

      const client: DatadogClient = { listMonitors: mockListMonitors };
      const service = new DatadogPollingService(client);

      service.start();

      // Initial poll fails, backoff becomes 60s
      await vi.advanceTimersByTimeAsync(0);
      expect(mockListMonitors).toHaveBeenCalledTimes(1);

      // Retry after 60s, succeeds, backoff resets to 30s
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockListMonitors).toHaveBeenCalledTimes(2);

      // Next poll after 30s (reset), fails, backoff becomes 60s
      await vi.advanceTimersByTimeAsync(30_000);
      expect(mockListMonitors).toHaveBeenCalledTimes(3);

      // Retry after 60s (not escalated further)
      await vi.advanceTimersByTimeAsync(60_000);
      expect(mockListMonitors).toHaveBeenCalledTimes(4);

      service.stop();
    });

    it('should not retry if service is stopped', async () => {
      const mockListMonitors = vi
        .fn()
        .mockRejectedValueOnce(new Error('Fail'));

      const client: DatadogClient = { listMonitors: mockListMonitors };
      const service = new DatadogPollingService(client);

      service.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockListMonitors).toHaveBeenCalledTimes(1);

      service.stop();

      // Even after backoff time, no retry should happen
      await vi.advanceTimersByTimeAsync(300_000);
      expect(mockListMonitors).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should not fire state change callbacks on API error', async () => {
      const mockListMonitors = vi
        .fn()
        .mockResolvedValueOnce([{ id: 1, name: 'Monitor 1', overall_state: 'OK' }])
        .mockRejectedValueOnce(new Error('API Error'));

      const client: DatadogClient = { listMonitors: mockListMonitors };
      const service = new DatadogPollingService(client);
      const callback = vi.fn();

      service.onMonitorStateChange(callback);
      service.start();

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(30_000);

      expect(callback).not.toHaveBeenCalled();
      service.stop();
    });
  });
});
