import { describe, it, expect } from "vitest";
import { handleRazorpayWebhook } from "../webhook.js";
import { appRuntime } from "../../runtime/runtime.js";

const capturedBody = (orderId: string): string =>
  JSON.stringify({
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: "pay_test_1",
          order_id: orderId,
          amount: 100,
          status: "captured",
        },
      },
    },
  });

describe("Razorpay webhook endpoint", () => {
  it("rejects a bad signature with 400 (does not ack)", async () => {
    const res = await handleRazorpayWebhook(
      appRuntime,
      capturedBody("order_anything"),
      "not-the-valid-signature",
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("PaymentVerificationError");
  });

  it("verifies the signature then 404s an unknown order (never trusts the body)", async () => {
    const res = await handleRazorpayWebhook(
      appRuntime,
      capturedBody("order_does_not_exist"),
      "valid",
    );
    expect(res.status).toBe(404);
    expect(res.body.error).toBe("OrderNotFound");
  });
});
