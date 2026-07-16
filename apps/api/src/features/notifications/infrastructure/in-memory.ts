import { Effect, Layer } from "effect";
import {
  NotificationService,
  type NotificationMessage,
} from "../application/port.js";

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
