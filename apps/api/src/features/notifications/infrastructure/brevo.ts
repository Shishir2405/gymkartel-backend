import { Effect, Layer } from "effect";
import * as Brevo from "@getbrevo/brevo";
import { Config } from "../../../shared/config/config.js";
import { ExternalServiceError } from "../../../shared/errors/errors.js";
import { NotificationService } from "../application/port.js";

export const NotificationServiceBrevo: Layer.Layer<NotificationService, never, Config> =
  Layer.effect(
    NotificationService,
    Effect.gen(function* () {
      const config = yield* Config;
      const smsApi = new Brevo.TransactionalSMSApi();
      smsApi.setApiKey(Brevo.TransactionalSMSApiApiKeys.apiKey, config.brevoApiKey);
      const emailApi = new Brevo.TransactionalEmailsApi();
      emailApi.setApiKey(
        Brevo.TransactionalEmailsApiApiKeys.apiKey,
        config.brevoApiKey,
      );

      return {
        send: (message) =>
          Effect.tryPromise({
            try: async () => {
              if (message.channel === "SMS" || message.channel === "WHATSAPP") {
                const sms = new Brevo.SendTransacSms();
                sms.sender = config.brevoSmsSender;
                sms.recipient = message.to.replace("+", "");
                sms.content = renderTemplate(message.template, message.params);
                await smsApi.sendTransacSms(sms);
                return;
              }
              const email = new Brevo.SendSmtpEmail();
              email.to = [{ email: message.to }];
              email.subject = message.template;
              email.htmlContent = `<p>${renderTemplate(message.template, message.params)}</p>`;
              await emailApi.sendTransacEmail(email);
            },
            catch: (cause) =>
              new ExternalServiceError({ service: "brevo", cause }),
          }),
      };
    }),
  );

const renderTemplate = (
  template: string,
  params: Readonly<Record<string, string | number>>,
): string => {
  const parts = Object.entries(params)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ");
  return `[${template}] ${parts}`;
};
