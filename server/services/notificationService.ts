import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface PushDispatchPayload {
  tokens: string[];
  title: string;
  body: string;
  data?: Record<string, string>;
}

export interface PushDispatchResult {
  sentCount: number;
  failedCount: number;
  invalidTokens: string[];
}

export interface NotificationDispatcher {
  sendPush(payload: PushDispatchPayload): Promise<PushDispatchResult>;
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
]);

export class FirebaseFcmDispatcher implements NotificationDispatcher {
  private readonly projectId?: string;

  constructor(projectId?: string) {
    this.projectId = projectId;
  }

  public async sendPush(payload: PushDispatchPayload): Promise<PushDispatchResult> {
    if (payload.tokens.length === 0) {
      return { sentCount: 0, failedCount: 0, invalidTokens: [] };
    }

    try {
      const app = getApps().length
        ? getApp()
        : initializeApp(this.projectId ? { projectId: this.projectId } : undefined);
      const messaging = getMessaging(app);
      const response = await messaging.sendEachForMulticast({
        tokens: payload.tokens,
        notification: {
          title: payload.title,
          body: payload.body,
        },
        data: payload.data,
        webpush: {
          fcmOptions: {
            link: '/',
          },
        },
      });

      const invalidTokens: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success && resp.error?.code && INVALID_TOKEN_CODES.has(resp.error.code)) {
          const badToken = payload.tokens[idx];
          if (badToken) invalidTokens.push(badToken);
        }
      });

      return {
        sentCount: response.successCount,
        failedCount: response.failureCount,
        invalidTokens,
      };
    } catch (err) {
      console.warn(
        'FCM push dispatch skipped/failed:',
        err instanceof Error ? err.message : 'unknown error'
      );
      return {
        sentCount: 0,
        failedCount: payload.tokens.length,
        invalidTokens: [],
      };
    }
  }
}
