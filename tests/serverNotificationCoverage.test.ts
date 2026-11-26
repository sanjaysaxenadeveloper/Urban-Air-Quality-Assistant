import { describe, expect, it, vi } from 'vitest';

const { mockSendEachForMulticast } = vi.hoisted(() => ({
  mockSendEachForMulticast: vi.fn(),
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({
    sendEachForMulticast: mockSendEachForMulticast,
  })),
}));

vi.mock('firebase-admin/app', () => ({
  getApps: vi.fn(() => []),
  getApp: vi.fn(() => ({})),
  initializeApp: vi.fn(() => ({})),
}));

import { FirebaseFcmDispatcher } from '../server/services/notificationService.ts';

describe('server/services/notificationService.ts 100% Coverage', () => {
  it('covers token pruning on invalid error codes', async () => {
    mockSendEachForMulticast.mockResolvedValueOnce({
      successCount: 1,
      failureCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
      ],
    });

    const dispatcher = new FirebaseFcmDispatcher('test-proj');
    const res = await dispatcher.sendPush({
      tokens: ['good-token', 'stale-token'],
      title: 'Alert',
      body: 'AQI 350',
    });

    expect(res.sentCount).toBe(1);
    expect(res.failedCount).toBe(1);
    expect(res.invalidTokens).toEqual(['stale-token']);
  });

  it('covers FCM crash catch block with non-Error reject and getApp branch', async () => {
    const { getApps } = await import('firebase-admin/app');
    (getApps as any).mockReturnValueOnce([1]); // getApps().length > 0 -> calls getApp()
    mockSendEachForMulticast.mockRejectedValueOnce('Non-error string failure');

    const dispatcher = new FirebaseFcmDispatcher();
    const res = await dispatcher.sendPush({
      tokens: ['tok1'],
      title: 'Alert',
      body: 'AQI 350',
    });

    expect(res.sentCount).toBe(0);
    expect(res.failedCount).toBe(1);
    expect(res.invalidTokens).toEqual([]);
  });

  it('covers token errors that are not invalid registration codes', async () => {
    mockSendEachForMulticast.mockResolvedValueOnce({
      successCount: 0,
      failureCount: 1,
      responses: [
        { success: false, error: { code: 'messaging/server-unavailable' } },
      ],
    });

    const dispatcher = new FirebaseFcmDispatcher('test-proj');
    const res = await dispatcher.sendPush({
      tokens: ['tok1'],
      title: 'Alert',
      body: 'AQI 350',
    });

    expect(res.sentCount).toBe(0);
    expect(res.failedCount).toBe(1);
    expect(res.invalidTokens).toEqual([]);
  });

  it('covers early return on empty tokens array', async () => {
    const dispatcher = new FirebaseFcmDispatcher();
    const res = await dispatcher.sendPush({
      tokens: [],
      title: 'Alert',
      body: 'AQI 350',
    });
    expect(res.sentCount).toBe(0);
    expect(res.failedCount).toBe(0);
  });
});
