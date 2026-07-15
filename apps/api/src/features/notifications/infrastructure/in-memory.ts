import { Effect, Layer } from "effect";
import {
  NotificationService,
  type NotificationMessage,
} from "../application/port.js";

/**
 * In-memory notification sink used by tests. Captures every message so a test
 * can assert an OTP SMS / booking email was enqueued without a real provider.
 */
export class NotificationRecorder {
  readonly sent: NotificationMessage[] = [];
}

export const NotificationServiceMemory = (
  recorder: NotificationRecorder = new NotificationRecorder(),
): Layer.Layer<NotificationService> =>
  Layer.succeed(NotificationService, {
    send: (message) =>
      Effect.sync(() => {
        recorder.sent.push(message);
      }),
  });
