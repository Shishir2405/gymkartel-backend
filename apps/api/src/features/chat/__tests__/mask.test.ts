import { describe, it, expect } from "vitest";
import { maskPii } from "../domain/mask.js";

describe("chat PII masking (both directions, product requirement)", () => {
  it("masks Indian phone numbers", () => {
    const r = maskPii("call me on 9876543210 tonight");
    expect(r.text).toContain("[number hidden]");
    expect(r.masked).toBe(true);
  });

  it("masks +91 prefixed numbers", () => {
    expect(maskPii("+91 9876543210").text).toContain("[number hidden]");
  });

  it("masks UPI handles", () => {
    const r = maskPii("pay me at rahul@okhdfcbank");
    expect(r.text).toContain("[handle hidden]");
  });

  it("masks links", () => {
    expect(maskPii("dm me https://wa.me/919876543210").text).toContain("[link hidden]");
    expect(maskPii("see insta.com/coach").text).toContain("[link hidden]");
  });

  it("leaves clean text untouched", () => {
    const r = maskPii("great session today, same time tomorrow?");
    expect(r.masked).toBe(false);
    expect(r.text).toBe("great session today, same time tomorrow?");
  });
});
