import { Effect, Layer } from "effect";
import { Expo } from "expo-server-sdk";
import { Config } from "../../../shared/config/config.js";
import { ExternalServiceError } from "../../../shared/errors/errors.js";
import { NotificationService } from "../application/port.js";

/**
 * Expo push adapter — the PUSH channel of the NotificationService port. `to` is
 * an Expo push token. Non-PUSH messages are a no-op here (Brevo owns them); the
 * composition root layers both adapters and routes by channel where needed.
 */
export const NotificationServiceExpo: Layer.Layer<NotificationService, never, Config> =
  Layer.effect(
    NotificationService,
    Effect.gen(function* () {
      const config = yield* Config;
      const expo = new Expo(
        config.expoAccessToken ? { accessToken: config.expoAccessToken } : {},
      );
      return {
        send: (message) =>
          Effect.tryPromise({
            try: async () => {
              if (message.channel !== "PUSH") return;
              if (!Expo.isExpoPushToken(message.to)) {
                throw new Error(`invalid Expo push token: ${message.to}`);
              }
              await expo.sendPushNotificationsAsync([
                {
                  to: message.to,
                  title: String(message.params.title ?? "Gym Kartel"),
                  body: String(message.params.body ?? ""),
                  data: { template: message.template },
                },
              ]);
            },
            catch: (cause) => new ExternalServiceError({ service: "expo", cause }),
          }),
      };
    }),
  );
